import React from "react";
import BigNumber from "bignumber.js";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import {
  AleoAmountTooLargeForTransaction,
  AleoFeeRecordInsufficientBalance,
  AleoFeeRecordRequired,
  AleoTwoRecordsRequired,
} from "@ledgerhq/live-common/families/aleo/errors";
import { SEND_FLOW_STEP, type SendFlowStep } from "@ledgerhq/live-common/flows/send/types";
import type { StepRegistry } from "@ledgerhq/live-common/flows/wizard/types";
import { act, renderWithReactQuery, screen } from "@tests/test-renderer";
import type { State } from "~/reducers/types";
import { SendFlowOrchestrator } from "LLM/features/Send/SendFlowOrchestrator";
import { SEND_FLOW_CONFIG } from "LLM/features/Send/constants";
import { AmountScreen } from "LLM/features/Send/screens/Amount";
import { BalanceTypeScreen } from "LLM/features/Send/screens/BalanceType";
import { RecipientScreen } from "LLM/features/Send/screens/Recipient";
import { SignatureScreen } from "LLM/features/Send/screens/Signature";
import { ALEO_ACCOUNT_2, makeAleoAccount } from "../../__mocks__/account.mock";
import {
  aleoAccountBridge,
  completePrivateSync,
  mockTransactionStatus,
  resetAleoBridgeMock,
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

jest.mock("LLM/components/DeviceIntentExecutor", () => {
  const actual = jest.requireActual("LLM/components/DeviceIntentExecutor");
  const ReactModule = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  return {
    ...actual,
    DeviceIntentExecutor: () =>
      ReactModule.createElement(View, { testID: "device-intent-executor" }),
  };
});

const ONE_ALEO = 1_000_000;

const aleoAccount = makeAleoAccount({
  transparentBalance: new BigNumber(5 * ONE_ALEO),
  privateBalance: new BigNumber(3 * ONE_ALEO),
  unspentPrivateRecords: [makeRecord(2 * ONE_ALEO), makeRecord(ONE_ALEO)],
  provableApi: { scannerStatus: { synced: true, percentage: 100 } },
});

const OWN_ADDRESS = aleoAccount.freshAddress;
const THIRD_PARTY_ADDRESS = ALEO_ACCOUNT_2.freshAddress;

const stepRegistry: StepRegistry<SendFlowStep> = {
  [SEND_FLOW_STEP.BALANCE_TYPE]: BalanceTypeScreen,
  [SEND_FLOW_STEP.RECIPIENT]: RecipientScreen,
  [SEND_FLOW_STEP.RECENT_HISTORY]: () => null,
  [SEND_FLOW_STEP.AMOUNT]: AmountScreen,
  [SEND_FLOW_STEP.CUSTOM_FEES]: () => null,
  [SEND_FLOW_STEP.COIN_CONTROL]: () => null,
  [SEND_FLOW_STEP.SIGNATURE]: SignatureScreen,
  [SEND_FLOW_STEP.CONFIRMATION]: () => null,
  [SEND_FLOW_STEP.PAY_SUCCESS]: () => null,
};

const HostStack = createNativeStackNavigator();

function renderSend() {
  return renderWithReactQuery(
    <HostStack.Navigator screenOptions={{ headerShown: false }}>
      <HostStack.Screen name="SendHost">
        {() => (
          <SendFlowOrchestrator
            initParams={{ account: aleoAccount }}
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
        accounts: { ...state.accounts, active: [aleoAccount] },
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

async function pickPrivate(user: User) {
  await user.press(await screen.findByText("Private balance"));
  await screen.findByText("Refreshing your private balance");
  await act(async () => {
    completePrivateSync(aleoAccount);
  });
  await screen.findByPlaceholderText(/^Enter address/);
}

// The self transfer row reads "Send to private balance"; a matched address row reads "Send to <address>".
const MATCHED_ADDRESS_ROW = /^Send to (?!private balance$|public balance$)/;

async function sendTo(user: User, address: string) {
  const input = await screen.findByPlaceholderText(/^Enter address/);
  await user.clear(input);
  await user.paste(input, address);
  await flushTimers();
  await user.press(await screen.findByText(MATCHED_ADDRESS_ROW));
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

async function reviewHalf(user: User) {
  await user.press(await screen.findByText("50%"));
  await user.press(screen.getByText("Review"));
}

function lastCheckedTransaction() {
  return aleoAccountBridge.getTransactionStatus.mock.lastCall?.[1];
}

describe("Aleo new send flow (integration)", () => {
  beforeEach(() => {
    resetAleoBridgeMock();
  });

  describe("native send modes", () => {
    it("should reach signing with a public transfer to a third party", async () => {
      const { user } = renderSend();

      await pickPublic(user);
      await sendTo(user, THIRD_PARTY_ADDRESS);
      await reviewHalf(user);

      expect(await screen.findByTestId("device-intent-executor")).toBeOnTheScreen();
      expect(lastCheckedTransaction()).toMatchObject({
        mode: "transfer_public",
        recipient: THIRD_PARTY_ADDRESS,
      });
    });

    it("should reach signing with a private transfer to a third party", async () => {
      const { user } = renderSend();

      await pickPrivate(user);
      await sendTo(user, THIRD_PARTY_ADDRESS);
      await reviewHalf(user);

      expect(await screen.findByTestId("device-intent-executor")).toBeOnTheScreen();
      expect(lastCheckedTransaction()).toMatchObject({
        mode: "transfer_private",
        recipient: THIRD_PARTY_ADDRESS,
      });
    });

    it("should reach signing with a public to private conversion from the self transfer row", async () => {
      const { user } = renderSend();

      await pickPublic(user);
      await user.press(await screen.findByText("Send to private balance"));
      await reviewHalf(user);

      expect(await screen.findByTestId("device-intent-executor")).toBeOnTheScreen();
      expect(lastCheckedTransaction()).toMatchObject({
        mode: "convert_public_to_private",
        recipient: OWN_ADDRESS,
      });
    });

    it("should reach signing with a private to public conversion from the self transfer row", async () => {
      const { user } = renderSend();

      await pickPrivate(user);
      await user.press(await screen.findByText("Send to public balance"));
      await reviewHalf(user);

      expect(await screen.findByTestId("device-intent-executor")).toBeOnTheScreen();
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
});
