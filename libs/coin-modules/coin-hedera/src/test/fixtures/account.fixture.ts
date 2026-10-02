import type { TokenCurrency } from "@ledgerhq/ledger-wallet-framework/types";
import type { TokenAccount } from "@ledgerhq/types-live";
import BigNumber from "bignumber.js";
import type {
  HederaAccount,
  HederaAccountRaw,
  HederaResources,
  HederaResourcesRaw,
} from "../../types";
import { getMockedCurrency, getMockedHTSTokenCurrency } from "./currency.fixture";

const defaultMockedCurrency = getMockedCurrency();
const defaultMockedTokenCurrency = getMockedHTSTokenCurrency();
const defaultMockAccountId = "js:2:hedera:0.0.1234567:hederaBip44";
const defaultMockTokenAccountId = `${defaultMockAccountId}+${defaultMockedTokenCurrency.id}`;
const defaultBalance = new BigNumber(100000000);
const defaultTokenBalance = new BigNumber(10);

export const mockHederaResources: HederaResources = {
  maxAutomaticTokenAssociations: 0,
  isAutoTokenAssociationEnabled: false,
  delegation: null,
};

export const mockHederaResourcesRaw: HederaResourcesRaw = {
  maxAutomaticTokenAssociations: 0,
  isAutoTokenAssociationEnabled: false,
  delegation: null,
};

/**
 * default settings:
 * - account balance is 1 HBAR
 * - auto token association is disabled
 * - subAccounts array is empty (no tokens account are used)
 */
export const getMockedAccount = (overrides?: Partial<HederaAccount>): HederaAccount => {
  return {
    type: "Account",
    id: defaultMockAccountId,
    seedIdentifier: "",
    derivationMode: "",
    index: 0,
    freshAddress: "0.0.12345",
    freshAddressPath: "44/3030",
    used: false,
    balance: defaultBalance,
    spendableBalance: defaultBalance,
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
    freshAddress: "0.0.12345",
    freshAddressPath: "44/3030",
    used: false,
    balance: defaultBalance.toString(),
    spendableBalance: defaultBalance.toString(),
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

/**
 * default settings:
 * - balance is 10
 */
export const getMockedTokenAccount = (
  token: TokenCurrency,
  overrides?: Partial<TokenAccount>,
): TokenAccount => {
  return {
    type: "TokenAccount",
    id: defaultMockTokenAccountId,
    parentId: defaultMockAccountId,
    token,
    balance: defaultTokenBalance,
    spendableBalance: defaultTokenBalance,
    creationDate: new Date(),
    operations: [],
    operationsCount: 0,
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

export const MAINNET_TEST_ACCOUNTS = {
  pristine: {
    accountId: "0.0.10901879",
    publicKey: "a29bf4d631ea5310bea92d3822a4ebfb2891f6643e839f306a6dc827f220d5ac",
  },
  withoutTokens: {
    accountId: "0.0.10901621",
    publicKey: "bf4315b0bad6a735dce83024283704211001925c00fca881610e0d9f13d9f17c",
  },
  withTokens: {
    accountId: "0.0.10901638",
    evmAddress: "0x0000000000000000000000000000000000a65886",
    accountIdWithErc20: "0.0.4351292",
    publicKey: "bf4315b0bad6a735dce83024283704211001925c00fca881610e0d9f13d9f17c",
    associatedTokenWithBalance: "0.0.456858",
    associatedTokenWithoutBalance: "0.0.7243470",
    notAssociatedToken: "0.0.3176721",
    erc20Token: "0xca367694cdac8f152e33683bb36cc9d6a73f1ef2",
  },
  withQuickBalanceChanges: {
    accountId: "0.0.10905827",
  },
  activeStaking: {
    accountId: "0.0.10901625",
    publicKey: "bf4315b0bad6a735dce83024283704211001925c00fca881610e0d9f13d9f17c",
  },
  inactiveStaking: {
    accountId: "0.0.10901597",
    evmAddress: "0xf8a372995a825c5f9db1e25de7598aca4692a628",
    publicKey: "021b03783a804e2e7dfb202e8f3028072070bf5ef43a3ef61a5ee6c05b4fb80992",
  },
  withStakingHistory: {
    accountId: "0.0.10901621",
  },
  withFailedTransactions: {
    accountId: "0.0.10905821",
  },
};
