import { IconsLegacy } from "@ledgerhq/native-ui";
import BigNumber from "bignumber.js";
import accountActions from "../accountActions";
import { ALEO_ACCOUNT_1 } from "../__mocks__/account.mock";
import { aleoCurrency } from "../__mocks__/currency.mock";
import { NavigatorName, ScreenName } from "~/const";
import ZeroBalanceDisabledModalContent from "~/components/FabActions/modals/ZeroBalanceDisabledModalContent";
import { getCurrencyConfiguration } from "@ledgerhq/live-common/config/index";
import type { AleoAccount } from "@ledgerhq/live-common/families/aleo/types";

jest.mock("@ledgerhq/native-ui", () => ({
  IconsLegacy: { TransferMedium: "TransferMedium", CoinsMedium: "CoinsMedium" },
}));

jest.mock("~/components/FabActions/modals/ZeroBalanceDisabledModalContent", () => ({
  __esModule: true,
  default: "ZeroBalanceDisabledModalContent",
}));

jest.mock("~/context/Locale", () => ({
  i18n: { t: (key: string) => key },
}));

jest.mock("@ledgerhq/live-common/config/index", () => ({
  getCurrencyConfiguration: jest.fn(),
}));

const mockGetCurrencyConfiguration = jest.mocked(getCurrencyConfiguration);

function enableStaking(enabled: boolean) {
  mockGetCurrencyConfiguration.mockReturnValue({
    status: { type: "active" },
    networkType: "mainnet",
    enableStaking: enabled,
  } as ReturnType<typeof getCurrencyConfiguration>);
}

function accountWithTransparentBalance(transparentBalance: BigNumber): AleoAccount {
  return {
    ...ALEO_ACCOUNT_1,
    aleoResources: {
      transparentBalance,
      provableApi: null,
      privateBalance: null,
      unspentPrivateRecords: null,
      lastPrivateSyncDate: null,
    },
  };
}

describe("accountActions.getMainActions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    enableStaking(false);
  });

  it("returns a single publicToPrivate action with correct shape", () => {
    const [action] = accountActions.getMainActions({ account: ALEO_ACCOUNT_1 });

    expect(action.id).toBe("public_to_private");
    expect(action.label).toBe("aleo.accountActions.publicToPrivate");
    expect(action.Icon).toBe(IconsLegacy.TransferMedium);
    expect(action.event).toBe("button_clicked");
    expect(action.eventProperties).toEqual({
      button: "public_to_private",
      currency: "ALEO",
      page: "Account Page",
    });
    expect(action.navigationParams).toEqual([
      NavigatorName.SendFunds,
      expect.objectContaining({
        screen: ScreenName.AleoSendBalanceSelection,
        params: expect.objectContaining({ isSelfTransfer: true }),
      }),
    ]);
  });

  it("is disabled with the zero-balance modal when account balance is zero", () => {
    const [action] = accountActions.getMainActions({
      account: { ...ALEO_ACCOUNT_1, balance: new BigNumber(0) },
    });

    expect(action.disabled).toBe(true);
    expect(action.modalOnDisabledClick?.component).toBe(ZeroBalanceDisabledModalContent);
  });

  it("uses a plain string label so ZeroBalanceDisabledModalContent can interpolate it as actionName", () => {
    const [action] = accountActions.getMainActions({ account: ALEO_ACCOUNT_1 });

    expect(typeof action.label).toBe("string");
  });

  it("is enabled when account balance is positive", () => {
    const [action] = accountActions.getMainActions({
      account: { ...ALEO_ACCOUNT_1, balance: new BigNumber(1000000) },
    });

    expect(action.disabled).toBe(false);
  });
});

describe("accountActions.getMainActions — stake entry point", () => {
  beforeEach(() => jest.clearAllMocks());

  it("is absent while enableStaking is off", () => {
    enableStaking(false);

    const actions = accountActions.getMainActions({ account: ALEO_ACCOUNT_1 });

    expect(actions.map(a => a.id)).toEqual(["public_to_private"]);
  });

  it("is absent when the currency has no registered config", () => {
    mockGetCurrencyConfiguration.mockImplementation(() => {
      throw new Error("no config");
    });

    const actions = accountActions.getMainActions({ account: ALEO_ACCOUNT_1 });

    expect(actions.map(a => a.id)).toEqual(["public_to_private"]);
  });

  it("leads the actions and opens the bond flow while enableStaking is on", () => {
    enableStaking(true);

    const [action] = accountActions.getMainActions({
      account: accountWithTransparentBalance(new BigNumber(1_000_000)),
    });

    expect(action.id).toBe("stake");
    expect(action.label).toBe("account.stake");
    expect(action.Icon).toBe(IconsLegacy.CoinsMedium);
    expect(action.disabled).toBe(false);
    expect(action.navigationParams).toEqual([
      NavigatorName.AleoBondPublicFlow,
      {
        screen: ScreenName.AleoBondPublicSelectValidator,
        params: { accountId: ALEO_ACCOUNT_1.id, parentId: undefined },
      },
    ]);
  });

  it("is disabled with the zero-balance modal when there is no public balance to bond", () => {
    enableStaking(true);

    const [action] = accountActions.getMainActions({
      account: accountWithTransparentBalance(new BigNumber(0)),
    });

    expect(action.id).toBe("stake");
    expect(action.disabled).toBe(true);
    expect(action.modalOnDisabledClick?.component).toBe(ZeroBalanceDisabledModalContent);
  });
});

describe("accountActions.getExtraSendActionParams", () => {
  it("returns navigationParams pointing to AleoSendBalanceSelection with isSelfTransfer: false", () => {
    const result = accountActions.getExtraSendActionParams({ account: ALEO_ACCOUNT_1 });

    expect(result.navigationParams).toEqual([
      NavigatorName.SendFunds,
      expect.objectContaining({
        screen: ScreenName.AleoSendBalanceSelection,
        params: expect.objectContaining({ isSelfTransfer: false }),
      }),
    ]);
  });
});

describe("accountActions.getAdditionalAssetActions", () => {
  it("with defaultAccount — navigates to AleoSendBalanceSelection with isSelfTransfer: true", () => {
    const [action] = accountActions.getAdditionalAssetActions({
      currency: aleoCurrency,
      defaultAccount: ALEO_ACCOUNT_1,
      parentAccount: undefined,
    });

    expect(action.navigationParams).toEqual([
      NavigatorName.SendFunds,
      expect.objectContaining({
        screen: ScreenName.AleoSendBalanceSelection,
        params: expect.objectContaining({ isSelfTransfer: true }),
      }),
    ]);
  });

  it("without defaultAccount — navigates to SendCoin with extra.isSelfTransfer: true", () => {
    const [action] = accountActions.getAdditionalAssetActions({
      currency: aleoCurrency,
      defaultAccount: undefined,
      parentAccount: undefined,
    });

    expect(action.navigationParams).toEqual([
      NavigatorName.SendFunds,
      expect.objectContaining({
        screen: ScreenName.SendCoin,
        params: expect.objectContaining({
          extra: expect.objectContaining({ isSelfTransfer: true }),
        }),
      }),
    ]);
  });

  it("is disabled when defaultAccount balance is zero", () => {
    const [action] = accountActions.getAdditionalAssetActions({
      currency: aleoCurrency,
      defaultAccount: { ...ALEO_ACCOUNT_1, balance: new BigNumber(0) },
      parentAccount: undefined,
    });

    expect(action.disabled).toBe(true);
  });

  it("leaves disabled unset when there is no defaultAccount", () => {
    const [action] = accountActions.getAdditionalAssetActions({
      currency: aleoCurrency,
      defaultAccount: undefined,
      parentAccount: undefined,
    });

    expect(action.disabled).toBeUndefined();
  });

  it("is enabled when defaultAccount balance is positive", () => {
    const [action] = accountActions.getAdditionalAssetActions({
      currency: aleoCurrency,
      defaultAccount: { ...ALEO_ACCOUNT_1, balance: new BigNumber(1000000) },
      parentAccount: undefined,
    });

    expect(action.disabled).toBe(false);
  });
});
