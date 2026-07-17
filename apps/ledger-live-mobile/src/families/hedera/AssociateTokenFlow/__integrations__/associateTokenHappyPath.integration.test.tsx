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
  createFakeOperation,
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
  id: "op-associate-1",
  hash: "0xassociatehash",
  type: "ASSOCIATE_TOKEN",
});

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

describe("AssociateTokenFlow [component] - happy path", () => {
  beforeAll(async () => {
    // Pre-warm the cached bridge promise so `useAccountBridge`'s `use()` call resolves
    // synchronously instead of suspending on first render.
    await getAccountBridge(HEDERA_ACCOUNT_1);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockBroadcast.mockResolvedValue(fakeOperation);
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

  it("walks SelectToken -> Summary -> SelectDevice -> ConnectDevice -> ValidationSuccess", async () => {
    const { user } = render(<TestNavigator />, {
      overrideInitialState: (state: State): State => ({
        ...state,
        accounts: { ...state.accounts, active: [HEDERA_ACCOUNT_1] },
      }),
    });

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

    // useBridgeTransaction is stubbed with a fixed transaction here, so this only proves the
    // plumbing: Summary forwards the bridge transaction through navigation params into
    // ConnectDevice/DeviceAction — it does not verify transaction building.
    await waitFor(() =>
      expect(deviceActionRequestSpy.mock.lastCall?.[0]?.transaction).toEqual(
        expect.objectContaining({
          family: "hedera",
          mode: HEDERA_TRANSACTION_MODES.TokenAssociate,
          assetReference: htsToken.contractAddress,
        })
      )
    );

    await waitFor(() => expect(mockBroadcast).toHaveBeenCalledTimes(1));

    expect(await screen.findByText("Transaction sent")).toBeVisible();
    expect(
      screen.getByText(
        "You will be able to receive this token once the Associate Token transaction has been confirmed"
      )
    ).toBeVisible();
  });
});
