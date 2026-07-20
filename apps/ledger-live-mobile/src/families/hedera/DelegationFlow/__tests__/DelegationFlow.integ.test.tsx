import React from "react";
import { getAccountBridge } from "@ledgerhq/live-common/bridge/index";
import { setHederaPreloadData } from "@ledgerhq/live-common/families/hedera/react";
import { render, screen, waitFor } from "@tests/test-renderer";
import { NavigatorName, ScreenName } from "~/const";
import type { State } from "~/reducers/types";
import { component as DelegationFlow } from "../index";
import { HEDERA_ACCOUNT_1 } from "../../__mocks__/account.mock";
import { hederaCurrency } from "../../__mocks__/currency.mock";
import { HEDERA_VALIDATOR_1, HEDERA_VALIDATOR_2 } from "../../__mocks__/validator.mock";
import {
  createHederaFlowTestNavigator,
  createFakeOperation,
  deviceActionRequestSpy,
  setDeviceActionSigned,
} from "../../__mocks__/flowTestSetup.mock";

// test-renderer's Providers don't include the notifications context the flow calls on exit.
jest.mock("LLM/features/NotificationsPrompt", () => ({
  useNotificationsContext: () => ({ notifyFlowCompleted: jest.fn() }),
}));

// hedera has no mock bridge; this stub is backed by real React state so the tests can drive the
// SelectValidator -> Summary -> `updateTransaction` round-trip.
jest.mock("@ledgerhq/live-common/bridge/useBridgeTransaction", () =>
  require("../../__mocks__/flowTestSetup.mock").createStatefulBridgeTransactionMock({
    family: "hedera",
    mode: "delegate",
    properties: { stakingNodeId: null },
  }),
);

jest.mock(
  "~/screens/SelectDevice",
  () => require("../../__mocks__/flowTestSetup.mock").selectDeviceModuleMock,
);

jest.mock(
  "~/components/DeviceAction",
  () => require("../../__mocks__/flowTestSetup.mock").deviceActionModuleMock,
);

jest.mock(
  "@ledgerhq/live-common/hooks/useBroadcast",
  () => require("../../__mocks__/flowTestSetup.mock").broadcastModuleMock,
);

const fakeOperation = createFakeOperation({
  id: "op-delegate-1",
  hash: "0xdelegatehash",
  type: "DELEGATE",
});

const TestNavigator = createHederaFlowTestNavigator({
  navigatorName: NavigatorName.HederaDelegationFlow,
  flowComponent: DelegationFlow,
  entryScreen: ScreenName.HederaDelegationSelectValidator,
  entryParams: { accountId: HEDERA_ACCOUNT_1.id },
});

describe("DelegationFlow [component]", () => {
  beforeAll(async () => {
    setHederaPreloadData({ validators: [HEDERA_VALIDATOR_1, HEDERA_VALIDATOR_2] }, hederaCurrency);
    // Warm the bridge cache so the flow reads it synchronously.
    await getAccountBridge(HEDERA_ACCOUNT_1);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    setDeviceActionSigned(fakeOperation);
  });

  it("walks SelectValidator -> Summary -> SelectDevice -> ConnectDevice -> ValidationSuccess", async () => {
    const { user } = render(<TestNavigator />, {
      overrideInitialState: (state: State): State => ({
        ...state,
        accounts: { ...state.accounts, active: [HEDERA_ACCOUNT_1] },
      }),
    });

    await user.press(await screen.findByText(HEDERA_VALIDATOR_1.name));

    expect(await screen.findByTestId("hedera-delegation-summary-validator")).toHaveTextContent(
      `Node ${HEDERA_VALIDATOR_1.nodeId}: ${HEDERA_VALIDATOR_1.name}`,
    );

    await user.press(await screen.findByTestId("enabled-hedera-summary-continue-button"));

    const selectDeviceButton = await screen.findByTestId("mock-select-device");
    await user.press(selectDeviceButton);

    await waitFor(() =>
      expect(deviceActionRequestSpy.mock.lastCall?.[0]?.transaction).toEqual(
        expect.objectContaining({
          family: "hedera",
          mode: "delegate",
          properties: expect.objectContaining({
            stakingNodeId: HEDERA_VALIDATOR_1.nodeId,
          }),
        }),
      ),
    );

    expect(await screen.findByText("You have successfully delegated your assets")).toBeVisible();
  });
});
