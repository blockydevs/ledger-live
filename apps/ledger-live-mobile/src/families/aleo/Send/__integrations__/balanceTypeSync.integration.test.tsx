import React from "react";
import { View } from "react-native";
import BigNumber from "bignumber.js";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { AleoAccount } from "@ledgerhq/live-common/families/aleo/types";
import { aleoPrivateSyncProgress$ } from "@ledgerhq/live-common/families/aleo/privateSyncProgress";
import { SEND_FLOW_STEP, type SendFlowStep } from "@ledgerhq/live-common/flows/send/types";
import type { StepRegistry } from "@ledgerhq/live-common/flows/wizard/types";
import { act, renderWithReactQuery, screen } from "@tests/test-renderer";
import type { State } from "~/reducers/types";
import { SendFlowOrchestrator } from "LLM/features/Send/SendFlowOrchestrator";
import { SEND_FLOW_CONFIG } from "LLM/features/Send/constants";
import { BalanceTypeScreen } from "LLM/features/Send/screens/BalanceType";
import { RecipientScreen } from "LLM/features/Send/screens/Recipient";
import { makeAleoAccount } from "../../__mocks__/account.mock";
import {
  aleoAccountBridge,
  completePrivateSync,
  failPrivateSync,
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

const ONE_ALEO = 1_000_000;

const aleoAccount = makeAleoAccount({
  transparentBalance: new BigNumber(5 * ONE_ALEO),
  privateBalance: new BigNumber(3 * ONE_ALEO),
  unspentPrivateRecords: [makeRecord(3 * ONE_ALEO)],
});

const stepRegistry: StepRegistry<SendFlowStep> = {
  [SEND_FLOW_STEP.BALANCE_TYPE]: BalanceTypeScreen,
  [SEND_FLOW_STEP.RECIPIENT]: RecipientScreen,
  [SEND_FLOW_STEP.RECENT_HISTORY]: () => null,
  [SEND_FLOW_STEP.AMOUNT]: () => null,
  [SEND_FLOW_STEP.CUSTOM_FEES]: () => null,
  [SEND_FLOW_STEP.COIN_CONTROL]: () => null,
  [SEND_FLOW_STEP.SIGNATURE]: () => null,
  [SEND_FLOW_STEP.CONFIRMATION]: () => null,
  [SEND_FLOW_STEP.PAY_SUCCESS]: () => null,
};

const HostStack = createNativeStackNavigator();

type SendPageProps = Readonly<{ isOpen: boolean; account: AleoAccount; onClose: () => void }>;

function SendPage({ isOpen, account, onClose }: SendPageProps) {
  if (!isOpen) return <View />;

  return (
    <HostStack.Navigator screenOptions={{ headerShown: false }}>
      <HostStack.Screen name="SendHost">
        {() => (
          <SendFlowOrchestrator
            initParams={{ account }}
            onClose={onClose}
            stepRegistry={stepRegistry}
            flowConfig={SEND_FLOW_CONFIG}
          />
        )}
      </HostStack.Screen>
    </HostStack.Navigator>
  );
}

function renderSend(onClose: () => void = () => {}, account: AleoAccount = aleoAccount) {
  const result = renderWithReactQuery(<SendPage isOpen account={account} onClose={onClose} />, {
    overrideInitialState: (state: State) => ({
      ...state,
      accounts: { ...state.accounts, active: [account] },
    }),
  });

  return {
    ...result,
    closeFlow: async () => {
      await act(async () => {
        result.rerender(<SendPage isOpen={false} account={account} onClose={onClose} />);
      });
    },
    reopenFlow: async () => {
      await act(async () => {
        result.rerender(<SendPage isOpen account={account} onClose={onClose} />);
      });
    },
  };
}

function syncedWithRecords(microcredits: number[]): AleoAccount {
  return makeAleoAccount({
    ...aleoAccount.aleoResources,
    unspentPrivateRecords: microcredits.map(makeRecord),
    lastPrivateSyncDate: new Date(),
    provableApi: { scannerStatus: { synced: true, percentage: 100 } },
  });
}

async function emitSyncProgress(progress: number) {
  await act(async () => {
    aleoPrivateSyncProgress$.next({ accountId: aleoAccount.id, progress });
    await jest.advanceTimersByTimeAsync(600);
  });
}

async function finishSync(syncedAccount: AleoAccount) {
  await act(async () => {
    completePrivateSync(syncedAccount);
  });
}

async function pickBalance(user: ReturnType<typeof renderSend>["user"], title: string) {
  await user.press(await screen.findByText(title));
}

describe("Aleo balance type sync (integration)", () => {
  beforeEach(() => {
    resetAleoBridgeMock();
  });

  it("should go straight to the recipient step without a sync for the public balance", async () => {
    const { user } = renderSend();

    await pickBalance(user, "Public balance");

    expect(await screen.findByPlaceholderText(/^Enter address/)).toBeVisible();
    expect(aleoAccountBridge.sync).not.toHaveBeenCalled();
  });

  it("should refresh the private balance with its progress, then open the recipient step", async () => {
    const { user } = renderSend();

    await pickBalance(user, "Private balance");

    expect(await screen.findByText("Refreshing your private balance")).toBeVisible();
    expect(screen.getByText("0%")).toBeVisible();
    expect(screen.queryByPlaceholderText(/^Enter address/)).not.toBeOnTheScreen();

    await emitSyncProgress(57);
    expect(screen.getByText("57%")).toBeVisible();

    await finishSync(syncedWithRecords([3 * ONE_ALEO]));

    expect(await screen.findByPlaceholderText(/^Enter address/)).toBeVisible();
  });

  it("should sync the private balance of a never synced account, then open the recipient step", async () => {
    const neverSyncedAccount = makeAleoAccount({ transparentBalance: new BigNumber(5 * ONE_ALEO) });
    const { user } = renderSend(undefined, neverSyncedAccount);

    await pickBalance(user, "Private balance");

    expect(await screen.findByText("Refreshing your private balance")).toBeVisible();
    expect(aleoAccountBridge.sync).toHaveBeenCalledWith(
      expect.objectContaining({ id: neverSyncedAccount.id }),
      expect.anything(),
    );

    await finishSync(syncedWithRecords([3 * ONE_ALEO]));

    expect(await screen.findByPlaceholderText(/^Enter address/)).toBeVisible();
  });

  it("should stop the sync when the flow is closed mid-sync and start over when opened again", async () => {
    const { user, closeFlow, reopenFlow } = renderSend();

    await pickBalance(user, "Private balance");
    await screen.findByText("Refreshing your private balance");
    await emitSyncProgress(57);

    await closeFlow();
    await reopenFlow();
    await pickBalance(user, "Private balance");

    expect(await screen.findByText("0%")).toBeVisible();
    expect(aleoAccountBridge.sync).toHaveBeenCalledTimes(2);
  });

  it("should restart the sync on Try again and go back to the balance pick on Cancel when it fails", async () => {
    const onClose = jest.fn();
    const { user } = renderSend(onClose);

    await pickBalance(user, "Private balance");
    await screen.findByText("Refreshing your private balance");
    await act(async () => {
      failPrivateSync(new Error("scanner down"));
    });

    expect(await screen.findByText("Private sync failed")).toBeVisible();
    await user.press(screen.getByText("Try again"));
    expect(await screen.findByText("Refreshing your private balance")).toBeVisible();
    expect(aleoAccountBridge.sync).toHaveBeenCalledTimes(2);

    await act(async () => {
      failPrivateSync(new Error("scanner down"));
    });
    await user.press(await screen.findByText("Cancel"));

    expect(screen.getByText("Select balance")).toBeVisible();
    expect(screen.queryByText("Private sync failed")).not.toBeOnTheScreen();
    expect(screen.queryByPlaceholderText(/^Enter address/)).not.toBeOnTheScreen();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("should warn how much one transaction can send before the recipient step", async () => {
    const { user } = renderSend();

    await pickBalance(user, "Private balance");
    await screen.findByText("Refreshing your private balance");
    await finishSync(syncedWithRecords(Array.from({ length: 15 }, () => ONE_ALEO)));

    expect(await screen.findByText("You can send up to 14 ALEO")).toBeVisible();
    expect(screen.queryByPlaceholderText(/^Enter address/)).not.toBeOnTheScreen();

    await user.press(screen.getByText("Continue"));

    expect(await screen.findByPlaceholderText(/^Enter address/)).toBeVisible();
  });
});
