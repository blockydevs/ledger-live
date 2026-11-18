import React from "react";
import BigNumber from "bignumber.js";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { Account } from "@ledgerhq/types-live";
import type { AleoAccount } from "@ledgerhq/live-common/families/aleo/types";
import { SEND_FLOW_STEP, type SendFlowStep } from "@ledgerhq/live-common/flows/send/types";
import type { StepRegistry } from "@ledgerhq/live-common/flows/wizard/types";
import { act, renderWithReactQuery, screen } from "@tests/test-renderer";
import type { State } from "~/reducers/types";
import { SendFlowOrchestrator } from "LLM/features/Send/SendFlowOrchestrator";
import { SEND_FLOW_CONFIG } from "LLM/features/Send/constants";
import { BalanceTypeScreen } from "LLM/features/Send/screens/BalanceType";
import { BalanceTypeSyncScreen } from "LLM/features/Send/screens/BalanceTypeSync";
import { RecipientScreen } from "LLM/features/Send/screens/Recipient";
import { makeAleoAccount } from "../../__mocks__/account.mock";
import { resetAleoBridgeMock } from "../../__mocks__/bridge.mock";
import { makeRecord } from "../../__mocks__/record.mock";

type PrivateSyncOptions = Parameters<
  typeof import("../../hooks/useAleoPrivateSync").useAleoPrivateSync
>[0];
type PrivateSyncState = { progress: number; error: Error | null };

const mockStart = jest.fn();
let mockLatestSyncOptions: PrivateSyncOptions | null = null;
let mockSetSyncState: ((state: PrivateSyncState) => void) | null = null;

jest.mock("../../hooks/useAleoPrivateSync", () => {
  const { useState } = jest.requireActual<typeof import("react")>("react");
  return {
    useAleoPrivateSync: (options: PrivateSyncOptions) => {
      const [state, setState] = useState<PrivateSyncState>({ progress: 0, error: null });
      mockLatestSyncOptions = options;
      mockSetSyncState = setState;
      return {
        ...state,
        isSyncing: state.error === null,
        start: mockStart,
        stop: jest.fn(),
      };
    },
  };
});

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
  [SEND_FLOW_STEP.BALANCE_TYPE_SYNC]: BalanceTypeSyncScreen,
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

function renderSend(onClose: () => void = () => {}, account: AleoAccount = aleoAccount) {
  return renderWithReactQuery(
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
    </HostStack.Navigator>,
    {
      overrideInitialState: (state: State) => ({
        ...state,
        accounts: { ...state.accounts, active: [account] },
      }),
    },
  );
}

function syncedWithRecords(microcredits: number[]): AleoAccount {
  return makeAleoAccount({
    ...aleoAccount.aleoResources,
    unspentPrivateRecords: microcredits.map(makeRecord),
    provableApi: { scannerStatus: { synced: true, percentage: 100 } },
  });
}

function finishSync(syncedAccount: Account) {
  act(() => mockLatestSyncOptions?.onAccountUpdated?.(syncedAccount));
}

async function pickPool(user: ReturnType<typeof renderSend>["user"], title: string) {
  await user.press(await screen.findByText(title));
}

describe("Aleo balance type sync (integration)", () => {
  beforeEach(() => {
    mockLatestSyncOptions = null;
    mockSetSyncState = null;
    mockStart.mockClear();
    resetAleoBridgeMock();
  });

  it("should go straight to the recipient step without a sync for the public balance", async () => {
    const { user } = renderSend();

    await pickPool(user, "Public balance");

    expect(await screen.findByPlaceholderText(/^Enter address/)).toBeVisible();
    expect(mockLatestSyncOptions).toBeNull();
  });

  it("should refresh the private balance with its progress, then open the recipient step", async () => {
    const { user } = renderSend();

    await pickPool(user, "Private balance");

    expect(await screen.findByText("Refreshing your private balance")).toBeVisible();
    expect(screen.getByText("0%")).toBeVisible();
    expect(mockLatestSyncOptions).toMatchObject({
      account: aleoAccount,
      autoStart: true,
      keepAliveOnUnmount: true,
    });
    expect(screen.queryByPlaceholderText(/^Enter address/)).not.toBeOnTheScreen();

    act(() => mockSetSyncState?.({ progress: 57, error: null }));
    expect(screen.getByText("57%")).toBeVisible();

    finishSync(syncedWithRecords([3 * ONE_ALEO]));

    expect(await screen.findByPlaceholderText(/^Enter address/)).toBeVisible();
  });

  it("should sync the private balance of a never synced account, then open the recipient step", async () => {
    const neverSyncedAccount = makeAleoAccount({ transparentBalance: new BigNumber(5 * ONE_ALEO) });
    const { user } = renderSend(undefined, neverSyncedAccount);

    await pickPool(user, "Private balance");

    expect(await screen.findByText("Refreshing your private balance")).toBeVisible();
    expect(mockLatestSyncOptions).toMatchObject({ account: neverSyncedAccount, autoStart: true });

    finishSync(syncedWithRecords([3 * ONE_ALEO]));

    expect(await screen.findByPlaceholderText(/^Enter address/)).toBeVisible();
  });

  it("should restart the sync on Try again and close the flow on Cancel when it fails", async () => {
    const onClose = jest.fn();
    const { user } = renderSend(onClose);

    await pickPool(user, "Private balance");
    await screen.findByText("Refreshing your private balance");
    act(() => mockSetSyncState?.({ progress: 30, error: new Error("scanner down") }));

    expect(screen.getByText("Private sync failed")).toBeVisible();
    await user.press(screen.getByText("Try again"));
    expect(mockStart).toHaveBeenCalledTimes(1);

    await user.press(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("should warn how much one transaction can send before the recipient step", async () => {
    const { user } = renderSend();

    await pickPool(user, "Private balance");
    await screen.findByText("Refreshing your private balance");
    finishSync(syncedWithRecords(Array.from({ length: 15 }, () => ONE_ALEO)));

    expect(await screen.findByText("You can send up to 14 ALEO")).toBeVisible();
    expect(screen.queryByPlaceholderText(/^Enter address/)).not.toBeOnTheScreen();

    await user.press(screen.getByText("Continue"));

    expect(await screen.findByPlaceholderText(/^Enter address/)).toBeVisible();
  });
});
