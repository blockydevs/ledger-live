import { renderHook, withReadOnlyDisabled } from "@tests/test-renderer";
import { NavigatorName, ScreenName } from "~/const";
import { ALEO_ACCOUNT_1 } from "~/families/aleo/__mocks__/account.mock";
import useAccountActions from "../useAccountActions";

const mockIsNewSendFlowEnabled = jest.fn();

jest.mock("LLM/features/Send/hooks/useNewSendFlowFeature", () => ({
  useNewSendFlowFeature: () => ({ isEnabledForFamily: mockIsNewSendFlowEnabled }),
}));
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual<typeof import("@react-navigation/native")>("@react-navigation/native"),
  useRoute: () => ({ name: ScreenName.Account }),
}));
jest.mock("@ledgerhq/live-common/bridge/useAccountBridge", () => ({
  useAccountBridge: () => ({}),
}));
jest.mock("@ledgerhq/live-common/platform/providers/RampCatalogProvider/useRampCatalog", () => ({
  useRampCatalog: () => ({ isCurrencyAvailable: () => false }),
}));
jest.mock("@ledgerhq/live-common/exchange/swap/hooks/index", () => ({
  ...jest.requireActual("@ledgerhq/live-common/exchange/swap/hooks/index"),
  useFetchCurrencyAll: () => ({ data: [] }),
}));
jest.mock("LLM/features/Swap", () => ({
  useOpenSwap: () => ({ handleOpenSwap: jest.fn() }),
}));
jest.mock("LLM/hooks/useStake/useStake", () => ({
  useStake: () => ({
    getCanStakeUsingLedgerLive: () => false,
    getCanStakeUsingPlatformApp: () => false,
    getRouteParamsForPlatformApp: () => null,
  }),
}));

function renderSendAction() {
  const { result } = renderHook(() => useAccountActions({ account: ALEO_ACCOUNT_1 }), {
    overrideInitialState: withReadOnlyDisabled,
  });
  return result.current.mainActions.find(action => action.id === "send");
}

describe("useAccountActions", () => {
  beforeEach(() => {
    mockIsNewSendFlowEnabled.mockReset();
  });

  it("GIVEN the new send flow WHEN an Aleo account sends THEN the new flow wins over the family send screen", () => {
    mockIsNewSendFlowEnabled.mockReturnValue(true);

    expect(renderSendAction()?.navigationParams).toEqual([
      NavigatorName.SendFlow,
      { params: { account: ALEO_ACCOUNT_1, parentAccount: undefined } },
    ]);
  });

  it("GIVEN the legacy send flow WHEN an Aleo account sends THEN the family send screen opens", () => {
    mockIsNewSendFlowEnabled.mockReturnValue(false);

    expect(renderSendAction()?.navigationParams).toEqual([
      NavigatorName.SendFunds,
      expect.objectContaining({ screen: ScreenName.AleoSendBalanceSelection }),
    ]);
  });
});
