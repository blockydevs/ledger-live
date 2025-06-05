import BigNumber from "bignumber.js";
import type {
  HederaAccount,
  HederaAccountRaw,
  HederaResources,
  HederaResourcesRaw,
} from "../../types";
import type { TokenAccount } from "@ledgerhq/types-live";
import { getMockedCurrency, getMockedTokenCurrency } from "./currency";
import { TokenCurrency } from "@ledgerhq/types-cryptoassets";

const defaultMockedCurrency = getMockedCurrency();
const defaultMockedTokenCurrency = getMockedTokenCurrency();
const defaultMockAccountId = "js:2:hedera:0.0.1234567:hederaBip44";
const defaultMockTokenAccountId = `${defaultMockAccountId}/${defaultMockedTokenCurrency.id}`;
const defaultBalance = new BigNumber(100000000);

export const mockHederaResources: HederaResources = {
  maxAutomaticTokenAssociations: 0,
  isAutoTokenAssociationsEnabled: false,
};

export const mockHederaResourcesRaw: HederaResourcesRaw = {
  maxAutomaticTokenAssociations: 0,
  isAutoTokenAssociationsEnabled: false,
};

/**
 * default settings:
 * - account balance is 1 HBAR
 * - auto token association is disabled
 */
export const getMockedAccount = (overrides?: Partial<HederaAccount>): HederaAccount => {
  return {
    type: "Account",
    id: defaultMockAccountId,
    seedIdentifier: "",
    derivationMode: "",
    index: 0,
    freshAddress: "",
    freshAddressPath: "",
    used: false,
    balance: defaultBalance,
    spendableBalance: new BigNumber(0),
    creationDate: new Date(),
    blockHeight: 0,
    currency: defaultMockedCurrency,
    operationsCount: 0,
    operations: [],
    pendingOperations: [],
    lastSyncDate: new Date(),
    balanceHistoryCache: {
      HOUR: { latestDate: null, balances: [] },
      DAY: { latestDate: null, balances: [] },
      WEEK: { latestDate: null, balances: [] },
    },
    swapHistory: [],
    subAccounts: [],
    hederaResources: mockHederaResources,
    ...overrides,
  };
};

export const getMockedAccountRaw = (overrides?: Partial<HederaAccountRaw>): HederaAccountRaw => {
  return {
    id: defaultMockAccountId,
    seedIdentifier: "",
    derivationMode: "",
    index: 0,
    freshAddress: "",
    freshAddressPath: "",
    used: false,
    balance: defaultBalance.toString(),
    spendableBalance: new BigNumber(0).toString(),
    creationDate: new Date().toISOString(),
    blockHeight: 0,
    currencyId: defaultMockedCurrency.id,
    operationsCount: 0,
    operations: [],
    pendingOperations: [],
    lastSyncDate: new Date().toISOString(),
    balanceHistoryCache: {
      HOUR: { latestDate: null, balances: [] },
      DAY: { latestDate: null, balances: [] },
      WEEK: { latestDate: null, balances: [] },
    },
    swapHistory: [],
    subAccounts: [],
    hederaResources: mockHederaResourcesRaw,
    ...overrides,
  };
};

export const getMockedTokenAccount = (
  token: TokenCurrency,
  overrides?: Partial<TokenAccount>,
): TokenAccount => {
  return {
    type: "TokenAccount",
    id: defaultMockTokenAccountId,
    parentId: defaultMockAccountId,
    token,
    balance: new BigNumber(1),
    spendableBalance: new BigNumber(1),
    creationDate: new Date(),
    operations: [],
    operationsCount: 1,
    pendingOperations: [],
    swapHistory: [],
    balanceHistoryCache: {
      HOUR: { latestDate: null, balances: [] },
      DAY: { latestDate: null, balances: [] },
      WEEK: { latestDate: null, balances: [] },
    },
    ...overrides,
  };
};
