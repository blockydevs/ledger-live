import React from "react";
import BigNumber from "bignumber.js";
import { getAccountBridge } from "@ledgerhq/live-common/bridge/index";
import { setHederaPreloadData } from "@ledgerhq/coin-hedera/preload-data";
import { render, screen, waitFor } from "@tests/test-renderer";
import { NavigatorName, ScreenName } from "~/const";
import type { State } from "~/reducers/types";
import { component as DelegationFlow } from "../index";
import type { HederaDelegationFlowParamList } from "../types";
import { HEDERA_ACCOUNT_1 } from "../../__mocks__/account.mock";
import { hederaCurrency } from "../../__mocks__/currency.mock";
import {
  createHederaFlowTestNavigator,
  createFakeOperation,
  mockBroadcast,
  deviceActionRequestSpy,
} from "../../__mocks__/hederaFlowTestSetup";

// DelegationFlow/index.tsx completes a notification prompt on flow exit; stub the context so
// the navigator doesn't need the real provider tree (test-renderer's Providers don't include it).
jest.mock("LLM/features/NotificationsPrompt", () => ({
  useNotificationsContext: () => ({ notifyFlowCompleted: jest.fn() }),
}));

const VALIDATOR_A = {
  nodeId: 1,
  minStake: new BigNumber(1_000),
  maxStake: new BigNumber(1_000_000_000),
  activeStake: new BigNumber(500_000),
  activeStakePercentage: new BigNumber(5),
  address: "0.0.3",
  addressChecksum: null,
  name: "Validator A",
  overstaked: false,
};

const VALIDATOR_B = {
  ...VALIDATOR_A,
  nodeId: 2,
  name: "Validator B",
};

// hedera has no registered mock bridge, so setEnv("MOCK","1") doesn't work here; stub the
// hook directly. Unlike AssociateTokenFlow's stateless stub, `updateTransaction` must be
// backed by real React state: Summary's effect reads `route.params.validator` and calls
// `updateTransaction`, and the test relies on that round-trip to prove SelectValidator ->
// Summary actually updates what's displayed. `updateTransaction`'s identity must stay stable
// (useCallback) or Summary's effect re-fires every render ("Maximum update depth exceeded").
jest.mock("@ledgerhq/live-common/bridge/useBridgeTransaction", () => {
  const ReactActual = jest.requireActual("react");
  const BigNumberActual = jest.requireActual("bignumber.js");

  const mockInitialTransaction = {
    family: "hedera",
    mode: "delegate",
    amount: new BigNumberActual(0),
    recipient: "",
    useAllAmount: false,
    properties: { stakingNodeId: null },
  };

  const mockStatus = {
    errors: {},
    warnings: {},
    estimatedFees: new BigNumberActual(0),
    amount: new BigNumberActual(0),
    totalSpent: new BigNumberActual(0),
  };

  return {
    __esModule: true,
    default: () => {
      const [transaction, setTransaction] = ReactActual.useState(
        mockInitialTransaction
      );
      // Must be stable across renders (useCallback): see the file-level comment above.
      const updateTransaction = ReactActual.useCallback(
        (
          updater: (
            t: typeof mockInitialTransaction
          ) => typeof mockInitialTransaction
        ) =>
          setTransaction((prev: typeof mockInitialTransaction) =>
            updater(prev)
          ),
        []
      );
      return {
        transaction,
        status: mockStatus,
        bridgeError: null,
        bridgePending: false,
        updateTransaction,
        setAccount: jest.fn(),
      };
    },
  };
});

jest.mock(
  "@ledgerhq/live-common/hooks/useBroadcast",
  () => require("../../__mocks__/hederaFlowTestSetup").useBroadcastModuleMock
);

jest.mock(
  "~/screens/SelectDevice",
  () => require("../../__mocks__/hederaFlowTestSetup").selectDeviceModuleMock
);

jest.mock(
  "~/components/DeviceAction",
  () =>
    require("../../__mocks__/hederaFlowTestSetup").deviceActionSignedModuleMock
);

const fakeOperation = createFakeOperation({
  id: "op-delegate-1",
  hash: "0xdelegatehash",
  type: "DELEGATE",
});

const TestNavigator = createHederaFlowTestNavigator<
  NavigatorName.HederaDelegationFlow,
  HederaDelegationFlowParamList
>({
  navigatorName: NavigatorName.HederaDelegationFlow,
  flowComponent: DelegationFlow,
  entryScreen: ScreenName.HederaDelegationSelectValidator,
  entryParams: { accountId: HEDERA_ACCOUNT_1.id },
});

describe("DelegationFlow [component] - happy path", () => {
  beforeAll(async () => {
    // Public API (coin-hedera/preload-data): useHederaValidators (real, unmocked) reads this
    // through the same observable module instance since both import the same specifier.
    setHederaPreloadData(
      { validators: [VALIDATOR_A, VALIDATOR_B] },
      hederaCurrency
    );
    // Pre-warm the cached bridge promise so `useAccountBridge`'s `use()` call resolves
    // synchronously instead of suspending: unlike AssociateTokenFlow, DelegationFlow's
    // Stack.Navigator has no `screenLayout={bridgeSuspenseScreenLayout}` Suspense boundary.
    await getAccountBridge(HEDERA_ACCOUNT_1);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockBroadcast.mockResolvedValue(fakeOperation);
  });

  it("walks SelectValidator -> Summary -> SelectDevice -> ConnectDevice -> ValidationSuccess", async () => {
    const { user } = render(<TestNavigator />, {
      overrideInitialState: (state: State): State => ({
        ...state,
        accounts: { ...state.accounts, active: [HEDERA_ACCOUNT_1] },
      }),
    });

    // Real SelectValidator screen, fed by the real useHederaValidators hook.
    await user.press(await screen.findByText(VALIDATOR_A.name));

    // Real Summary screen: the tapped validator round-tripped through navigation params and
    // the (stateful) mocked bridge transaction, and is now reflected in the summary row.
    expect(
      await screen.findByTestId("hedera-delegation-summary-validator")
    ).toHaveTextContent(`Node ${VALIDATOR_A.nodeId}: ${VALIDATOR_A.name}`);

    await user.press(
      await screen.findByTestId("enabled-hedera-summary-continue-button")
    );

    const selectDeviceButton = await screen.findByTestId("mock-select-device");
    await user.press(selectDeviceButton);

    // useBridgeTransaction is a stateful mock here, updated by the real Summary screen, so
    // this proves the actual transaction (validator/nodeId included) reaching the signer.
    await waitFor(() =>
      expect(deviceActionRequestSpy.mock.lastCall?.[0]?.transaction).toEqual(
        expect.objectContaining({
          family: "hedera",
          mode: "delegate",
          properties: expect.objectContaining({
            stakingNodeId: VALIDATOR_A.nodeId,
          }),
        })
      )
    );

    await waitFor(() => expect(mockBroadcast).toHaveBeenCalledTimes(1));

    expect(
      await screen.findByText("You have successfully delegated your assets")
    ).toBeVisible();
  });
});
