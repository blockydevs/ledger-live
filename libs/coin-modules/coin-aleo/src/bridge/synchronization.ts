import {
  emptyHistoryCache,
  encodeAccountId,
  // encodeTokenAccountId,
} from "@ledgerhq/coin-framework/account/index";
import { GetAccountShape, makeSync } from "@ledgerhq/coin-framework/bridge/jsHelpers";
import { Account, Operation, TokenAccount } from "@ledgerhq/types-live";
import { TokenCurrency } from "@ledgerhq/types-cryptoassets";
import BigNumber from "bignumber.js";
import { apiClient } from "../network/api";
import { formatCurrency } from "../utils/formatCurrency";
// import { findTokenByAddressInCurrency } from "@ledgerhq/cryptoassets/lib/tokens";
// import { encodeOperationId } from "@ledgerhq/coin-framework/lib/operation";

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

  const publicAccountBalance = await apiClient.getPublicAccountBalance(address);
  const balance = formatCurrency(publicAccountBalance);

  const transactions = await apiClient.getAccountTransactions({ address, fetchAllPages: false });

  console.log(transactions);

  if (transactions.transactions[0]) {
    const transaction = transactions.transactions[0];
    // const token = findTokenByAddressInCurrency("aleo", currency.id);
    // console.log(token);
    //   console.log(token);
    // const encodedTokenId = token
    //   ? encodeTokenAccountId(address, token)
    //   : transaction.transaction_id;
    const singleTransaction: Operation = {
      // id: encodeOperationId(encodedTokenId, transaction.transaction_id, "OUT"),
      id: transaction.transaction_id,
      hash: transaction.transaction_id,
      type: "OUT",
      value: new BigNumber(0),
      fee: new BigNumber(0),
      senders: [transaction.sender_address],
      recipients: transaction.recipient_address.length > 0 ? [transaction.recipient_address] : [],
      blockHeight: undefined,
      blockHash: undefined,
      accountId: "",
      date: new Date(parseInt(transaction.block_timestamp) * 1000),
      extra: undefined,
    };
    return {
      type: "Account",
      id: accountId,
      syncHash: "",
      balance,
      spendableBalance: new BigNumber(0),
      blockHeight: 0,
      operations: [singleTransaction],
      operationsCount: 1,
      lastSyncDate: new Date(),
    } as Partial<Account>;
  }

  return {
    type: "Account",
    id: accountId,
    syncHash: "",
    balance,
    spendableBalance: new BigNumber(0),
    blockHeight: 0,
    operations: [],
    operationsCount: 0,
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
  };
};

export const sync = makeSync({
  getAccountShape,
  //   postSync,
  shouldMergeOps: false,
});
