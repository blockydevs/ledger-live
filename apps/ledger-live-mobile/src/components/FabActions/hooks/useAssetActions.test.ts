import { act, renderHook, withFlagOverrides } from "@tests/test-renderer";
import { getCryptoCurrencyById } from "@domain/entity-currency-crypto";
import { genAccount, genTokenAccount } from "@ledgerhq/ledger-wallet-framework/mocks/account";
import type { State } from "~/reducers/types";
import { NavigatorName, ScreenName } from "~/const";
import useAssetActions from "./useAssetActions";
import { getCustomSendFlow } from "~/screens/SendFunds/utils/customSendFlow";
import { aleoTokenCurrency } from "~/families/aleo/__mocks__/currency.mock";

const mockNavigate = jest.fn();
const mockOpenDrawer = jest.fn();

jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useRoute: () => ({ name: "Asset", key: "asset-key", params: {} }),
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock("LLM/features/ModularDrawer", () => ({
  ...jest.requireActual("LLM/features/ModularDrawer"),
  useModularDrawerController: () => ({ openDrawer: mockOpenDrawer }),
}));

jest.mock("@ledgerhq/live-common/exchange/swap/hooks/index", () => ({
  useFetchCurrencyAll: () => ({ data: [] }),
}));

jest.mock("~/generated/accountActions", () => ({
  __esModule: true,
  default: {
    aleo: {
      getAdditionalAssetActions: jest.fn(() => [{ id: "custom-action", label: "Custom" }]),
    },
  },
}));

jest.mock("~/screens/SendFunds/utils/customSendFlow", () => ({
  getCustomSendFlow: jest.fn(() => null),
}));

const mockGetCustomSendFlow = jest.mocked(getCustomSendFlow);
const currencyAleo = getCryptoCurrencyById("aleo");
const ALEO_ACCOUNT_1 = genAccount("asset-actions-aleo-1", {
  currency: currencyAleo,
  operationsSize: 3,
});
const ALEO_ACCOUNT_2 = genAccount("asset-actions-aleo-2", {
  currency: currencyAleo,
  operationsSize: 3,
});

const withSingleAccount = (state: State): State => ({
  ...state,
  settings: { ...state.settings, readOnlyModeEnabled: false },
  accounts: { active: [ALEO_ACCOUNT_1] },
});

const withTwoAccounts = (state: State): State => ({
  ...state,
  settings: { ...state.settings, readOnlyModeEnabled: false },
  accounts: { active: [ALEO_ACCOUNT_1, ALEO_ACCOUNT_2] },
});

describe("useAssetActions - custom send flow", () => {
  beforeEach(() => {
    mockGetCustomSendFlow.mockClear();
    mockGetCustomSendFlow.mockReturnValue(null);
  });

  it("uses buildSendEntrypoint when the family has a custom send flow", () => {
    mockGetCustomSendFlow.mockReturnValue({
      screens: [],
      buildSendEntrypoint: jest.fn(() => ({
        screen: ScreenName.AleoSendBalanceSelection,
        params: {},
      })),
    });

    const { result } = renderHook(
      () => useAssetActions({ currency: currencyAleo, accounts: [ALEO_ACCOUNT_1] }),
      { overrideInitialState: withSingleAccount },
    );

    const sendAction = result.current.mainActions.find(a => a.id === "send");

    expect(sendAction?.navigationParams?.[1]).toMatchObject({
      screen: ScreenName.AleoSendBalanceSelection,
    });
  });

  it("uses SendSelectRecipient with accountId when 1 account and no custom flow", () => {
    const { result } = renderHook(
      () => useAssetActions({ currency: currencyAleo, accounts: [ALEO_ACCOUNT_1] }),
      { overrideInitialState: withSingleAccount },
    );

    const sendAction = result.current.mainActions.find(a => a.id === "send");

    expect(sendAction?.navigationParams?.[1]).toMatchObject({
      screen: ScreenName.SendSelectRecipient,
      params: expect.objectContaining({ accountId: ALEO_ACCOUNT_1.id }),
    });
  });

  it("uses SendCoin with selectedCurrency when there is no single default account", () => {
    const { result } = renderHook(
      () => useAssetActions({ currency: currencyAleo, accounts: [ALEO_ACCOUNT_1, ALEO_ACCOUNT_2] }),
      { overrideInitialState: withTwoAccounts },
    );

    const sendAction = result.current.mainActions.find(a => a.id === "send");

    expect(sendAction?.navigationParams?.[1]).toMatchObject({
      screen: ScreenName.SendCoin,
      params: expect.objectContaining({ selectedCurrency: currencyAleo }),
    });
  });

  it("resolves family from the parent currency when currency is a token", () => {
    renderHook(() => useAssetActions({ currency: aleoTokenCurrency, accounts: [ALEO_ACCOUNT_1] }), {
      overrideInitialState: withSingleAccount,
    });

    expect(mockGetCustomSendFlow).toHaveBeenCalledWith("aleo");
  });

  it("includes additional family actions from getAdditionalAssetActions", () => {
    const { result } = renderHook(
      () => useAssetActions({ currency: currencyAleo, accounts: [ALEO_ACCOUNT_1] }),
      { overrideInitialState: withSingleAccount },
    );

    expect(result.current.mainActions).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "custom-action" })]),
    );
  });

  it("omits send and receive for a family that disables them (hypercore)", () => {
    const currencyHypercore = getCryptoCurrencyById("hypercore");

    const { result } = renderHook(
      () => useAssetActions({ currency: currencyHypercore, accounts: [ALEO_ACCOUNT_1] }),
      { overrideInitialState: withSingleAccount },
    );

    expect(result.current.mainActions.find(a => a.id === "send")).toBeUndefined();
    expect(result.current.mainActions.find(a => a.id === "receive")).toBeUndefined();
  });
});

const withNewSendFlowForAleo = (withAccounts: (state: State) => State) =>
  withFlagOverrides(
    { newSendFlow: { enabled: true, params: { families: ["aleo"], excludedCurrencyIds: [] } } },
    withAccounts,
  );

describe("useAssetActions - new send flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCustomSendFlow.mockReturnValue(null);
  });

  it("opens the new send flow for the only account of an enabled family", () => {
    const { result } = renderHook(
      () => useAssetActions({ currency: currencyAleo, accounts: [ALEO_ACCOUNT_1] }),
      { overrideInitialState: withNewSendFlowForAleo(withSingleAccount) },
    );
    const sendAction = result.current.mainActions.find(a => a.id === "send");

    act(() => sendAction?.customHandler?.());

    expect(sendAction?.navigationParams).toBeUndefined();
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(NavigatorName.SendFlow, {
      params: expect.objectContaining({ account: ALEO_ACCOUNT_1, parentAccount: undefined }),
    });
  });

  it("opens the new send flow with the parent for the only token account of an enabled family", () => {
    const tokenAccount = genTokenAccount(0, ALEO_ACCOUNT_1, aleoTokenCurrency);
    const parentAccount = { ...ALEO_ACCOUNT_1, subAccounts: [tokenAccount] };
    const { result } = renderHook(
      () => useAssetActions({ currency: aleoTokenCurrency, accounts: [tokenAccount] }),
      {
        overrideInitialState: withNewSendFlowForAleo(state => ({
          ...withSingleAccount(state),
          accounts: { active: [parentAccount] },
        })),
      },
    );
    const sendAction = result.current.mainActions.find(a => a.id === "send");

    act(() => sendAction?.customHandler?.());

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(NavigatorName.SendFlow, {
      params: expect.objectContaining({ account: tokenAccount, parentAccount }),
    });
  });

  it("asks for the account first when an enabled family has several accounts", () => {
    const { result } = renderHook(
      () => useAssetActions({ currency: currencyAleo, accounts: [ALEO_ACCOUNT_1, ALEO_ACCOUNT_2] }),
      { overrideInitialState: withNewSendFlowForAleo(withTwoAccounts) },
    );
    const sendAction = result.current.mainActions.find(a => a.id === "send");

    act(() => sendAction?.customHandler?.());

    expect(mockOpenDrawer).toHaveBeenCalledTimes(1);
    expect(mockOpenDrawer).toHaveBeenCalledWith(
      expect.objectContaining({ flow: "send", currencies: [currencyAleo.id] }),
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
