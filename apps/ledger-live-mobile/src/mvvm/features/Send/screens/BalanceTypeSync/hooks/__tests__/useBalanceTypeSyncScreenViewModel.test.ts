import { renderHook } from "@tests/test-renderer";
import { useNavigation } from "@react-navigation/native";
import type { Account, AccountLike } from "@ledgerhq/types-live";
import { ScreenName } from "~/const";
import { ALEO_ACCOUNT_1, ALEO_TOKEN_ACCOUNT_1 } from "~/families/aleo/__mocks__/account.mock";
import { getCustomSendFlow } from "~/screens/SendFunds/utils/customSendFlow";
import { useSendFlowActions, useSendFlowData } from "../../../../context/SendFlowContext";
import { useBalanceTypeSyncScreenViewModel } from "../useBalanceTypeSyncScreenViewModel";

jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual<typeof import("@react-navigation/native")>("@react-navigation/native"),
  useNavigation: jest.fn(),
}));
jest.mock("../../../../context/SendFlowContext");
jest.mock("~/screens/SendFunds/utils/customSendFlow", () => ({ getCustomSendFlow: jest.fn() }));

const mockReplace = jest.fn();
const mockClose = jest.fn();
const transaction = { family: "aleo" };

const mockedUseNavigation = jest.mocked(useNavigation);
const mockedUseSendFlowData = jest.mocked(useSendFlowData);
const mockedUseSendFlowActions = jest.mocked(useSendFlowActions);
const mockedGetCustomSendFlow = jest.mocked(getCustomSendFlow);

function BalanceTypeSync() {
  return null;
}

function mockFlowState(account: AccountLike | null, parentAccount: Account | null = null) {
  mockedUseSendFlowData.mockReturnValue({
    state: { account: { account, parentAccount }, transaction: { transaction } },
  } as never);
}

function renderViewModel() {
  return renderHook(() => useBalanceTypeSyncScreenViewModel());
}

describe("useBalanceTypeSyncScreenViewModel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseNavigation.mockReturnValue({ replace: mockReplace } as never);
    mockedUseSendFlowActions.mockReturnValue({ close: mockClose } as never);
    mockedGetCustomSendFlow.mockReturnValue({ BalanceTypeSync, screens: [] });
    mockFlowState(ALEO_ACCOUNT_1);
  });

  it("GIVEN a family with a balance type sync WHEN rendered THEN its slot gets the main account and the transaction", () => {
    const { result } = renderViewModel();

    expect(mockedGetCustomSendFlow).toHaveBeenCalledWith("aleo");
    expect(result.current).toMatchObject({
      BalanceTypeSync,
      transaction,
      account: ALEO_ACCOUNT_1,
    });
  });

  it("GIVEN a token account WHEN rendered THEN the slot gets the parent account", () => {
    mockFlowState(ALEO_TOKEN_ACCOUNT_1, ALEO_ACCOUNT_1);

    const { result } = renderViewModel();

    expect(result.current.account).toBe(ALEO_ACCOUNT_1);
  });

  it("GIVEN a family without a balance type sync WHEN rendered THEN no slot is returned", () => {
    mockedGetCustomSendFlow.mockReturnValue(null);

    const { result } = renderViewModel();

    expect(result.current.BalanceTypeSync).toBeUndefined();
  });

  it("GIVEN no account WHEN rendered THEN no slot is resolved", () => {
    mockFlowState(null);

    const { result } = renderViewModel();

    expect(mockedGetCustomSendFlow).not.toHaveBeenCalled();
    expect(result.current.BalanceTypeSync).toBeUndefined();
  });

  it("GIVEN the sync step WHEN the sync completes THEN the recipient step replaces it", () => {
    const { result } = renderViewModel();

    result.current.onComplete();

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith(ScreenName.SendFlowRecipient);
  });

  it("GIVEN the sync step WHEN the sync closes THEN the flow closes", () => {
    const { result } = renderViewModel();

    result.current.onClose();

    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});
