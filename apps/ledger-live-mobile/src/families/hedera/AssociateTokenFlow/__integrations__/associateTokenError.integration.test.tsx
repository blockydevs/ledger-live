import React from "react";
import { getAccountBridge } from "@ledgerhq/live-common/bridge/index";
import { useTokensData } from "@features/platform-currencies";
import { HEDERA_TRANSACTION_MODES } from "@ledgerhq/live-common/families/hedera/constants";
import { render, screen, waitFor } from "@tests/test-renderer";
import { NavigatorName, ScreenName } from "~/const";
import type { State } from "~/reducers/types";
import { component as AssociateTokenFlow } from "../index";
import type { HederaAssociateTokenFlowParamList } from "../types";
import { HEDERA_ACCOUNT_1 } from "../../__mocks__/account.mock";
import { htsToken } from "../../__mocks__/currency.mock";
import {
  createHederaFlowTestNavigator,
  mockBroadcast,
  deviceActionRequestSpy,
} from "../../__mocks__/hederaFlowTestSetup";

// Real network fetcher for the token list; stubbed exactly like
// AssociateTokenFlow/01-SelectToken.test.tsx does, since this flow starts from that screen.
jest.mock("@features/platform-currencies");

jest.mock(
  "@ledgerhq/live-common/bridge/useBridgeTransaction",
  () =>
    require("../../__mocks__/hederaFlowTestSetup")
      .associateBridgeTransactionModuleMock
);

// SECURITY: useSignedTxHandler (real, it's the subject under test) holds a useBroadcast
// internally. Mobile has no network blocking in its jest setup, so leaving this unmocked
// would fire a real signed-transaction write at Hedera mainnet from CI. This error-path test
// never reaches broadcast (the sign error short-circuits it), but the mock still must be in
// place: an unmocked useBroadcast is the security hole, regardless of whether this specific
// test happens to call it.
jest.mock(
  "@ledgerhq/live-common/hooks/useBroadcast",
  () => require("../../__mocks__/hederaFlowTestSetup").useBroadcastModuleMock
);

jest.mock(
  "~/screens/SelectDevice",
  () => require("../../__mocks__/hederaFlowTestSetup").selectDeviceModuleMock
);

jest.mock("~/components/DeviceAction", () =>
  require("../../__mocks__/hederaFlowTestSetup").createDeviceActionSignErrorModuleMock(
    "Associate token device error"
  )
);

const mockedUseTokensData = jest.mocked(useTokensData);

const TestNavigator = createHederaFlowTestNavigator<
  NavigatorName.HederaAssociateTokenFlow,
  HederaAssociateTokenFlowParamList
>({
  navigatorName: NavigatorName.HederaAssociateTokenFlow,
  flowComponent: AssociateTokenFlow,
  entryScreen: ScreenName.HederaAssociateTokenSelectToken,
  entryParams: { accountId: HEDERA_ACCOUNT_1.id },
});

describe("AssociateTokenFlow [component] - error path", () => {
  beforeAll(async () => {
    // Pre-warm the cached bridge promise so `useAccountBridge`'s `use()` call resolves
    // synchronously instead of suspending on first render.
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
    const tokenRow = await screen.findByTestId(
      `big-currency-row-${htsToken.id}`
    );
    await user.press(tokenRow);

    const continueButton = await screen.findByTestId(
      "enabled-hedera-associate-summary-continue-button"
    );
    await user.press(continueButton);

    const selectDeviceButton = await screen.findByTestId("mock-select-device");
    await user.press(selectDeviceButton);
  }

  it("reaches ValidationError when the device sign fails, and never broadcasts", async () => {
    const { user } = render(<TestNavigator />, {
      overrideInitialState: (state: State): State => ({
        ...state,
        accounts: { ...state.accounts, active: [HEDERA_ACCOUNT_1] },
      }),
    });

    await walkToConnectDevice(user);

    expect(
      await screen.findByText("Associate token device error")
    ).toBeVisible();
    expect(mockBroadcast).not.toHaveBeenCalled();

    // Plumbing check only, see associateTokenHappyPath.integration.test.tsx for the full comment.
    expect(deviceActionRequestSpy.mock.lastCall?.[0]?.transaction).toEqual(
      expect.objectContaining({
        family: "hedera",
        mode: HEDERA_TRANSACTION_MODES.TokenAssociate,
        assetReference: htsToken.contractAddress,
      })
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

    await waitFor(() =>
      expect(screen.getByTestId("mock-select-device")).toBeVisible()
    );
  });
});
