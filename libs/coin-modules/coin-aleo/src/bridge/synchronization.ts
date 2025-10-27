import { emptyHistoryCache, encodeAccountId } from "@ledgerhq/coin-framework/account/index";
import { GetAccountShape, makeSync } from "@ledgerhq/coin-framework/bridge/jsHelpers";
import { Account, Operation, TokenAccount } from "@ledgerhq/types-live";
import { TokenCurrency } from "@ledgerhq/types-cryptoassets";
import BigNumber from "bignumber.js";

/**
 * Main synchronization process
 * Get the main Account and the potential TokenAccounts linked to it
 */
export const getAccountShape: GetAccountShape<Account> = async infos => {
  const { address, derivationMode, currency } = infos;

  // eslint-disable-next-line no-console
  console.log("BRIDGE FIRED");

  const accountId = encodeAccountId({
    type: "js",
    version: "2",
    currencyId: currency.id,
    xpubOrAddress: address,
    derivationMode,
  });

  return {
    type: "Account",
    id: accountId,
    syncHash: "",
    balance: new BigNumber(0),
    spendableBalance: new BigNumber(0),
    blockHeight: 0,
    operations: [],
    operationsCount: 0,
    subAccounts: [],
    nfts: [],
    lastSyncDate: new Date(),
  } as Partial<Account>;
};

/**
 * Getting all token related operations in order to provide TokenAccounts
 */
export const getSubAccounts = async (): Promise<Partial<TokenAccount>[]> => {
  return [];
};

/**
 * Fetch the balance for a token and creates a TokenAccount based on this and the provided operations
 */
export const getSubAccountShape = async (): Promise<Partial<TokenAccount>> => {
  return {
    type: "TokenAccount",
    id: "",
    parentId: "",
    token: {} as TokenCurrency,
    balance: BigNumber(0),
    spendableBalance: BigNumber(0),
    creationDate: new Date(),
    operations: [],
    operationsCount: 0,
    pendingOperations: [],
    balanceHistoryCache: emptyHistoryCache,
    swapHistory: [],
  };
};

/**
 * Get a finalized operation depending on its status (confirmed or not)
 */
export const getOperationStatus = async (): Promise<Operation | null> => {
  return null;
};

/**
 * After each sync, it might be necessary to remove pending operations
 * inside of subAccounts.
 */
export const postSync = (initial: Account, synced: Account): Account => {
  return {
    ...synced,
    pendingOperations: [],
    subAccounts: [],
  };
};

export const sync = makeSync({
  getAccountShape,
  //   postSync,
  shouldMergeOps: false,
});
