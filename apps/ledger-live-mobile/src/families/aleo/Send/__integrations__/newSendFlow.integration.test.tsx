import React from "react";
import BigNumber from "bignumber.js";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import {
  AleoAmountTooLargeForTransaction,
  AleoFeeRecordInsufficientBalance,
  AleoFeeRecordRequired,
  AleoTwoRecordsRequired,
} from "@ledgerhq/live-common/families/aleo/errors";
import type {
  AleoAccount,
  AleoTokenAccount,
  Transaction,
} from "@ledgerhq/live-common/families/aleo/types";
import type { SignedOperation } from "@ledgerhq/types-live";
import { getMainAccount } from "@ledgerhq/live-common/account/index";
import { SEND_FLOW_STEP, type SendFlowStep } from "@ledgerhq/live-common/flows/send/types";
import type { StepRegistry } from "@ledgerhq/live-common/flows/wizard/types";
import { act, renderWithReactQuery, screen } from "@tests/test-renderer";
import type { State } from "~/reducers/types";
import { SendFlowOrchestrator } from "LLM/features/Send/SendFlowOrchestrator";
import { SEND_FLOW_CONFIG } from "LLM/features/Send/constants";
import { AmountScreen } from "LLM/features/Send/screens/Amount";
import { BalanceTypeScreen } from "LLM/features/Send/screens/BalanceType";
import { ConfirmationScreen } from "LLM/features/Send/screens/Confirmation";
import { RecipientScreen } from "LLM/features/Send/screens/Recipient";
import { SignatureScreen } from "LLM/features/Send/screens/Signature";
import {
  ALEO_ACCOUNT_2,
  ALEO_TOKEN_ACCOUNT_1,
  makeAleoAccount,
} from "../../__mocks__/account.mock";
import {
  aleoAccountBridge,
  completePrivateSync,
  mockTransactionStatus,
  resetAleoBridgeMock,
  signedOperation,
} from "../../__mocks__/bridge.mock";
import { makeRecord } from "../../__mocks__/record.mock";

jest.mock(
  "@ledgerhq/live-common/bridge/index",
  () => require("../../__mocks__/bridge.mock").aleoBridgeModule,
);

jest.mock("LLM/features/Contacts/hooks/useContactsAddressValidationAdapter", () => ({
  useContactsAddressValidationAdapter: () => ({
    validateAddress: async ({ address }: { address: string }) => ({
      status: "valid",
      resolvedAddress: address,
      isDomain: false,
    }),
  }),
}));

type SignedJobState = Readonly<{ type: "signed"; signedOperation: SignedOperation }>;

let mockOnIntentJobStateChanged: ((jobState: SignedJobState) => void) | null = null;

jest.mock("LLM/components/DeviceIntentExecutor", () => ({
  ...jest.requireActual("LLM/components/DeviceIntentExecutor"),
  DeviceIntentExecutor: ({
    onIntentJobStateChanged,
  }: {
    onIntentJobStateChanged: (jobState: SignedJobState) => void;
  }) => {
    mockOnIntentJobStateChanged = onIntentJobStateChanged;
    return null;
  },
}));

const ONE_ALEO = 1_000_000;
const ONE_USAD = 1_000_000;

const aleoAccount = makeAleoAccount({
  transparentBalance: new BigNumber(5 * ONE_ALEO),
  privateBalance: new BigNumber(3 * ONE_ALEO),
  unspentPrivateRecords: [makeRecord(2 * ONE_ALEO), makeRecord(ONE_ALEO)],
  provableApi: { scannerStatus: { synced: true, percentage: 100 } },
});

const OWN_ADDRESS = aleoAccount.freshAddress;
const THIRD_PARTY_ADDRESS = ALEO_ACCOUNT_2.freshAddress;

const tokenAccount: AleoTokenAccount = {
  ...ALEO_TOKEN_ACCOUNT_1,
  transparentBalance: new BigNumber(7 * ONE_USAD),
  privateBalance: new BigNumber(4 * ONE_USAD),
  unspentPrivateRecords: [makeRecord(3 * ONE_USAD), makeRecord(ONE_USAD)],
};
const tokenParentAccount: AleoAccount = { ...aleoAccount, subAccounts: [tokenAccount] };
const tokenSendParams = { account: tokenAccount, parentAccount: tokenParentAccount };

const stepRegistry: StepRegistry<SendFlowStep> = {
  [SEND_FLOW_STEP.BALANCE_TYPE]: BalanceTypeScreen,
  [SEND_FLOW_STEP.RECIPIENT]: RecipientScreen,
  [SEND_FLOW_STEP.RECENT_HISTORY]: () => null,
  [SEND_FLOW_STEP.AMOUNT]: AmountScreen,
  [SEND_FLOW_STEP.CUSTOM_FEES]: () => null,
  [SEND_FLOW_STEP.COIN_CONTROL]: () => null,
  [SEND_FLOW_STEP.SIGNATURE]: SignatureScreen,
  [SEND_FLOW_STEP.CONFIRMATION]: ConfirmationScreen,
  [SEND_FLOW_STEP.PAY_SUCCESS]: () => null,
};

const HostStack = createNativeStackNavigator();

function renderSend(
  initParams: { account: AleoAccount | AleoTokenAccount; parentAccount?: AleoAccount } = {
    account: aleoAccount,
  },
) {
  const mainAccount = getMainAccount(initParams.account, initParams.parentAccount);

  return renderWithReactQuery(
    <HostStack.Navigator screenOptions={{ headerShown: false }}>
      <HostStack.Screen name="SendHost">
        {() => (
          <SendFlowOrchestrator
            initParams={initParams}
            onClose={() => {}}
            stepRegistry={stepRegistry}
            flowConfig={SEND_FLOW_CONFIG}
          />
        )}
      </HostStack.Screen>
    </HostStack.Navigator>,
    {
      overrideInitialState: (state: State) => ({
        ...state,
        accounts: { ...state.accounts, active: [mainAccount] },
      }),
    },
  );
}

type User = ReturnType<typeof renderSend>["user"];

async function flushTimers() {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(600);
  });
}

async function pickPublic(user: User) {
  await user.press(await screen.findByText("Public balance"));
  await screen.findByPlaceholderText(/^Enter address/);
}

async function startPrivateSync(user: User, syncedAccount: AleoAccount) {
  await user.press(await screen.findByText("Private balance"));
  await screen.findByText("Refreshing your private balance");
  await act(async () => {
    completePrivateSync(syncedAccount);
  });
}

async function pickPrivate(user: User, syncedAccount: AleoAccount = aleoAccount) {
  await startPrivateSync(user, syncedAccount);
  await screen.findByPlaceholderText(/^Enter address/);
}

async function sendTo(user: User, address: string) {
  const input = await screen.findByPlaceholderText(/^Enter address/);
  await user.clear(input);
  await user.paste(input, address);
  await flushTimers();
  await user.press(await screen.findByTestId("new-send-flow-address-confirm"));
  await screen.findByText("Review");
}

async function backToRecipient(user: User) {
  await user.press(screen.getByLabelText("Back"));
  await screen.findByPlaceholderText(/^Enter address/);
}

async function backToBalanceType(user: User) {
  await backToRecipient(user);
  await user.press(screen.getByLabelText("Back"));
  await screen.findByText("Public balance");
}

async function signOnDevice() {
  const onSigned = mockOnIntentJobStateChanged;
  if (!onSigned)
    throw new Error("signOnDevice: the signature step never mounted the device executor");
  await act(async () => {
    onSigned({ type: "signed", signedOperation: signedOperation() });
    await jest.runOnlyPendingTimersAsync();
  });
}

async function sendHalf(user: User) {
  await user.press(await screen.findByText("50%"));
  await user.press(screen.getByText("Review"));
  await signOnDevice();
}

function lastCheckedTransaction() {
  return aleoAccountBridge.getTransactionStatus.mock.lastCall?.[1];
}

describe("Aleo new send flow (integration)", () => {
  beforeEach(() => {
    mockOnIntentJobStateChanged = null;
    resetAleoBridgeMock();
  });

  describe("native send modes", () => {
    it("should complete a public transfer to a third party", async () => {
      const { user } = renderSend();

      await pickPublic(user);
      await sendTo(user, THIRD_PARTY_ADDRESS);
      await sendHalf(user);

      expect(await screen.findByText("Transaction signed")).toBeVisible();
      expect(lastCheckedTransaction()).toMatchObject({
        mode: "transfer_public",
        recipient: THIRD_PARTY_ADDRESS,
      });
    });

    it("should complete a private transfer to a third party", async () => {
      const { user } = renderSend();

      await pickPrivate(user);
      await sendTo(user, THIRD_PARTY_ADDRESS);
      await sendHalf(user);

      expect(await screen.findByText("Transaction signed")).toBeVisible();
      expect(lastCheckedTransaction()).toMatchObject({
        mode: "transfer_private",
        recipient: THIRD_PARTY_ADDRESS,
      });
    });

    it("should complete a public to private conversion from the self transfer row", async () => {
      const { user } = renderSend();

      await pickPublic(user);
      await user.press(await screen.findByText("Send to private balance"));
      await sendHalf(user);

      expect(await screen.findByText("Transaction signed")).toBeVisible();
      expect(lastCheckedTransaction()).toMatchObject({
        mode: "convert_public_to_private",
        recipient: OWN_ADDRESS,
      });
    });

    it("should complete a private to public conversion from the self transfer row", async () => {
      const { user } = renderSend();

      await pickPrivate(user);
      await user.press(await screen.findByText("Send to public balance"));
      await sendHalf(user);

      expect(await screen.findByText("Transaction signed")).toBeVisible();
      expect(lastCheckedTransaction()).toMatchObject({
        mode: "convert_private_to_public",
        recipient: OWN_ADDRESS,
      });
    });
  });

  describe("amount step", () => {
    it("should show the sponsored zero fee without fee presets, custom fees or coin control", async () => {
      mockTransactionStatus({ estimatedFees: new BigNumber(0) });
      const { user } = renderSend();

      await pickPublic(user);
      await sendTo(user, THIRD_PARTY_ADDRESS);

      expect(await screen.findByTestId("send-network-fees-value")).toHaveTextContent("$0.00");
      expect(screen.getByTestId("send-network-fees-secondary-value")).toHaveTextContent(
        /^0(\.0+)? ALEO$/,
      );
      expect(screen.queryByTestId("send-fee-payment-entry")).not.toBeOnTheScreen();
      expect(screen.queryByText(/Custom fees|Coin control/)).not.toBeOnTheScreen();
    });

    it.each<{ errors: Record<string, Error>; copy: string }>([
      {
        errors: { amount: new AleoAmountTooLargeForTransaction() },
        copy: "Amount too large for one transaction",
      },
      {
        errors: { feeRecord: new AleoTwoRecordsRequired() },
        copy: "Private send requires at least two records.",
      },
      {
        errors: { feeRecord: new AleoFeeRecordRequired() },
        copy: "Another private record is required to cover the network fee.",
      },
      {
        errors: { feeRecord: new AleoFeeRecordInsufficientBalance() },
        copy: "No private record can cover the network fee.",
      },
    ])('should show "$copy" when the private send is rejected', async ({ errors, copy }) => {
      mockTransactionStatus({ errors });
      const { user } = renderSend();

      await pickPrivate(user);
      await sendTo(user, THIRD_PARTY_ADDRESS);
      await user.press(await screen.findByText("50%"));

      expect(await screen.findByText(copy)).toBeVisible();
    });
  });

  describe("switching pool or recipient", () => {
    it("should keep the mode and recipient consistent across pool and recipient changes", async () => {
      const { user } = renderSend();

      await pickPublic(user);
      await user.press(await screen.findByText("Send to private balance"));
      await screen.findByText("Review");
      expect(lastCheckedTransaction()).toMatchObject({
        mode: "convert_public_to_private",
        recipient: OWN_ADDRESS,
      });

      await backToRecipient(user);
      await sendTo(user, THIRD_PARTY_ADDRESS);
      expect(lastCheckedTransaction()).toMatchObject({
        mode: "transfer_public",
        recipient: THIRD_PARTY_ADDRESS,
      });

      await backToBalanceType(user);
      await pickPrivate(user);
      await sendTo(user, OWN_ADDRESS);
      expect(lastCheckedTransaction()).toMatchObject({
        mode: "convert_private_to_public",
        recipient: OWN_ADDRESS,
      });

      await backToRecipient(user);
      await sendTo(user, THIRD_PARTY_ADDRESS);
      expect(lastCheckedTransaction()).toMatchObject({
        mode: "transfer_private",
        recipient: THIRD_PARTY_ADDRESS,
      });

      await backToBalanceType(user);
      await pickPublic(user);
      await sendTo(user, OWN_ADDRESS);
      expect(lastCheckedTransaction()).toMatchObject({
        mode: "convert_public_to_private",
        recipient: OWN_ADDRESS,
      });
    });
  });

  describe("token account", () => {
    it("should offer the token's own public and private balances", async () => {
      renderSend(tokenSendParams);

      expect(await screen.findByText("7 USAD")).toBeVisible();
      expect(screen.getByText("4 USAD")).toBeVisible();
    });

    it.each<{
      name: string;
      pickBalance: (user: User) => Promise<void>;
      pickRecipient: (user: User) => Promise<void>;
      mode: Transaction["mode"];
      recipient: string;
    }>([
      {
        name: "a public token transfer to a third party",
        pickBalance: pickPublic,
        pickRecipient: user => sendTo(user, THIRD_PARTY_ADDRESS),
        mode: "transfer_public",
        recipient: THIRD_PARTY_ADDRESS,
      },
      {
        name: "a private token transfer to a third party",
        pickBalance: user => pickPrivate(user, tokenParentAccount),
        pickRecipient: user => sendTo(user, THIRD_PARTY_ADDRESS),
        mode: "transfer_private",
        recipient: THIRD_PARTY_ADDRESS,
      },
      {
        name: "a public to private token conversion",
        pickBalance: pickPublic,
        pickRecipient: async user => user.press(await screen.findByText("Send to private balance")),
        mode: "convert_token_public_to_private",
        recipient: OWN_ADDRESS,
      },
      {
        name: "a private to public token conversion",
        pickBalance: user => pickPrivate(user, tokenParentAccount),
        pickRecipient: async user => user.press(await screen.findByText("Send to public balance")),
        mode: "convert_token_private_to_public",
        recipient: OWN_ADDRESS,
      },
    ])("should complete $name", async ({ pickBalance, pickRecipient, mode, recipient }) => {
      const { user } = renderSend(tokenSendParams);

      await pickBalance(user);
      await pickRecipient(user);
      await sendHalf(user);

      expect(await screen.findByText("Transaction signed")).toBeVisible();
      expect(lastCheckedTransaction()).toMatchObject({
        mode,
        subAccountId: tokenAccount.id,
        recipient,
      });
    });

    it("should cap a private token send at its 13 largest records, in the token ticker", async () => {
      const tokenWithFourteenRecords: AleoTokenAccount = {
        ...tokenAccount,
        unspentPrivateRecords: Array.from({ length: 14 }, (_, index) =>
          makeRecord((index + 1) * ONE_USAD),
        ),
      };
      const { user } = renderSend(tokenSendParams);

      await startPrivateSync(user, {
        ...tokenParentAccount,
        subAccounts: [tokenWithFourteenRecords],
      });

      expect(await screen.findByText("You can send up to 104 USAD")).toBeVisible();
      expect(screen.getByText(/one transaction can use a maximum of 13\./)).toBeVisible();
    });
  });
});
