import React from "react";
import { getAccountBridge } from "@ledgerhq/live-common/bridge/index";
import { useTokensData } from "@features/platform-currencies";
import { HEDERA_TRANSACTION_MODES } from "@ledgerhq/live-common/families/hedera/constants";
import { render, screen, waitFor } from "@tests/test-renderer";
import { NavigatorName, ScreenName } from "~/const";
import type { State } from "~/reducers/types";
import { component as AssociateTokenFlow } from "../index";
import { HEDERA_ACCOUNT_1 } from "../../__mocks__/account.mock";
import { htsToken } from "../../__mocks__/currency.mock";
import {
  createHederaFlowTestNavigator,
  createFakeOperation,
  deviceActionRequestSpy,
  setDeviceActionSigned,
  setDeviceActionSignError,
} from "../../__mocks__/flowTestSetup.mock";

// SelectToken fetches its token list over the network.
jest.mock("@features/platform-currencies");

jest.mock(
  "@ledgerhq/live-common/bridge/useBridgeTransaction",
  () => require("../../__mocks__/flowTestSetup.mock").associateBridgeTransactionModuleMock,
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
  id: "op-associate-1",
  hash: "0xassociatehash",
  type: "ASSOCIATE_TOKEN",
});

const mockedUseTokensData = jest.mocked(useTokensData);

const TestNavigator = createHederaFlowTestNavigator({
  navigatorName: NavigatorName.HederaAssociateTokenFlow,
  flowComponent: AssociateTokenFlow,
  entryScreen: ScreenName.HederaAssociateTokenSelectToken,
  entryParams: { accountId: HEDERA_ACCOUNT_1.id },
});

beforeAll(async () => {
  // Warm the bridge cache so the flow reads it synchronously.
  await getAccountBridge(HEDERA_ACCOUNT_1);
});

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseTokensData.mockReturnValue({
    data: { tokens: [htsToken], pagination: { nextCursor: "" } },
    isLoading: false,
    isSuccess: true,
    error: undefined,
    isError: false,
    loadNext: jest.fn(),
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useTokensData>);
});

async function walkToConnectDevice(user: ReturnType<typeof render>["user"]) {
  const tokenRow = await screen.findByTestId(`big-currency-row-${htsToken.id}`);
  await user.press(tokenRow);

  const continueButton = await screen.findByTestId(
    "enabled-hedera-associate-summary-continue-button",
  );
  await user.press(continueButton);

  const selectDeviceButton = await screen.findByTestId("mock-select-device");
  await user.press(selectDeviceButton);
}

describe("AssociateTokenFlow [component] - happy path", () => {
  beforeEach(() => {
    setDeviceActionSigned(fakeOperation);
  });

  it("walks SelectToken -> Summary -> SelectDevice -> ConnectDevice -> ValidationSuccess", async () => {
    const { user } = render(<TestNavigator />, {
      overrideInitialState: (state: State): State => ({
        ...state,
        accounts: { ...state.accounts, active: [HEDERA_ACCOUNT_1] },
      }),
    });

    await walkToConnectDevice(user);

    await waitFor(() =>
      expect(deviceActionRequestSpy.mock.lastCall?.[0]?.transaction).toEqual(
        expect.objectContaining({
          family: "hedera",
          mode: HEDERA_TRANSACTION_MODES.TokenAssociate,
          assetReference: htsToken.contractAddress,
        }),
      ),
    );

    expect(await screen.findByText("Transaction sent")).toBeVisible();
    expect(
      screen.getByText(
        "You will be able to receive this token once the Associate Token transaction has been confirmed",
      ),
    ).toBeVisible();
  });
});

describe("AssociateTokenFlow [component] - error path", () => {
  beforeEach(() => {
    setDeviceActionSignError("Associate token device error");
  });

  it("reaches ValidationError when the device sign fails, and never broadcasts", async () => {
    const { user } = render(<TestNavigator />, {
      overrideInitialState: (state: State): State => ({
        ...state,
        accounts: { ...state.accounts, active: [HEDERA_ACCOUNT_1] },
      }),
    });

    await walkToConnectDevice(user);

    expect(await screen.findByText("Associate token device error")).toBeVisible();
    expect(screen.queryByText("Transaction sent")).toBeNull();

    expect(deviceActionRequestSpy.mock.lastCall?.[0]?.transaction).toEqual(
      expect.objectContaining({
        family: "hedera",
        mode: HEDERA_TRANSACTION_MODES.TokenAssociate,
        assetReference: htsToken.contractAddress,
      }),
    );
  });

  it("retry navigates back to the previous (select device) screen", async () => {
    const { user } = render(<TestNavigator />, {
      overrideInitialState: (state: State): State => ({
        ...state,
        accounts: { ...state.accounts, active: [HEDERA_ACCOUNT_1] },
      }),
    });

    await walkToConnectDevice(user);
    await screen.findByText("Associate token device error");

    const retryButton = await screen.findByText("Retry");
    await user.press(retryButton);

    await waitFor(() => expect(screen.getByTestId("mock-select-device")).toBeVisible());
  });
});
