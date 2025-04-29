import invariant from "invariant";
import {
  getDerivationScheme,
  Result,
  runDerivationScheme,
} from "@ledgerhq/coin-framework/derivation";
import { BigNumber } from "bignumber.js";
import type { Account, Operation, TokenAccount } from "@ledgerhq/types-live";
import { getAccountsForPublicKey, getOperationsForAccount } from "../api/mirror";
import {
  GetAccountShape,
  IterateResultBuilder,
  mergeOps,
} from "@ledgerhq/coin-framework/bridge/jsHelpers";
import {
  decodeTokenAccountId,
  emptyHistoryCache,
  encodeAccountId,
  encodeTokenAccountId,
} from "@ledgerhq/coin-framework/account";
import { TokenCurrency } from "@ledgerhq/types-cryptoassets";
import { AccountBalance, getAccountBalance } from "../api/network";
import { decodeOperationId } from "@ledgerhq/coin-framework/operation";

export const getAccountShape: GetAccountShape<Account> = async (
  info,
  { blacklistedTokenIds },
): Promise<Partial<Account>> => {
  const { currency, derivationMode, address, initialAccount } = info;

  invariant(address, "an hedera address is expected");

  const liveAccountId = encodeAccountId({
    type: "js",
    version: "2",
    currencyId: currency.id,
    xpubOrAddress: address,
    derivationMode,
  });

  // get current account balance
  const accountBalance = await getAccountBalance(address);

  // grab latest operation's consensus timestamp for incremental sync
  const oldOperations = initialAccount?.operations ?? [];
  const latestOperationTimestamp = oldOperations[0]
    ? Math.floor(oldOperations[0].date.getTime() / 1000)
    : 0;

  accountBalance.tokens;
  // merge new operations w/ previously synced ones
  const newOperations = await getOperationsForAccount(
    liveAccountId,
    address,
    new BigNumber(latestOperationTimestamp).toString(),
  );

  const operations = mergeOps(oldOperations, newOperations.coinOperations);
  const newSubAccounts = await getSubAccounts(
    liveAccountId,
    newOperations.tokenOperations,
    accountBalance,
    blacklistedTokenIds,
  );

  const subAccounts = mergeSubAccounts(initialAccount, newSubAccounts);

  console.log("[DEBUG] coin-hedera bridge getAccountShape", {
    info,
    accountBalance,
    oldOperations,
    operations,
    latestOperationTimestamp,
    blacklistedTokenIds,
    newSubAccounts,
    subAccounts,
    output: {
      id: liveAccountId,
      freshAddress: address,
      balance: accountBalance.balance,
      spendableBalance: accountBalance.balance,
      operations,
      // NOTE: there are no "blocks" in hedera
      // Set a value just so that operations are considered confirmed according to isConfirmedOperation
      blockHeight: 10,
    },
  });

  return {
    id: liveAccountId,
    freshAddress: address,
    balance: accountBalance.balance,
    spendableBalance: accountBalance.balance,
    operations,
    // NOTE: there are no "blocks" in hedera
    // Set a value just so that operations are considered confirmed according to isConfirmedOperation
    blockHeight: 10,
    subAccounts,
  };
};

const getSubAccounts = async (
  accountId: string,
  lastTokenOperations: Operation[],
  accountBalance: AccountBalance,
  blacklistedTokenIds: string[] = [],
): Promise<TokenAccount[]> => {
  console.log("[DEBUG] getsubaccounts", {
    accountId,
    lastTokenOperations,
    accountBalance,
    blacklistedTokenIds,
  });

  // Creating a Map of Operations by TokenCurrencies in order to know which TokenAccounts should be synced as well
  const operationsByToken = lastTokenOperations.reduce<Map<TokenCurrency, Operation[]>>(
    (acc, operation) => {
      const { accountId } = decodeOperationId(operation.id);
      const { token } = decodeTokenAccountId(accountId);

      console.log("[DEBUG] getsubaccounts reduce", { operation, accountId, token });

      if (!token || blacklistedTokenIds.includes(token.id)) return acc;

      if (!acc.has(token)) {
        acc.set(token, []);
      }

      acc.get(token)?.push(operation);

      return acc;
    },
    new Map<TokenCurrency, Operation[]>(),
  );

  const subAccounts: TokenAccount[] = [];

  for (const [token, operations] of operationsByToken.entries()) {
    const parentId = accountId;
    const balance = accountBalance.tokens.find(t => t.tokenId === token.contractAddress)?.balance;

    if (!balance) {
      continue;
    }

    subAccounts.push({
      type: "TokenAccount",
      id: encodeTokenAccountId(parentId, token),
      parentId,
      token,
      balance,
      spendableBalance: balance,
      creationDate: new Date(),
      operations,
      operationsCount: operations.length,
      pendingOperations: [],
      balanceHistoryCache: emptyHistoryCache,
      swapHistory: [],
    });
  }

  return subAccounts;
};

/**
 * List of properties of a sub account that can be updated when 2 "identical" accounts are found
 */
const updatableSubAccountProperties: { name: string; isOps: boolean }[] = [
  { name: "balance", isOps: false },
  { name: "spendableBalance", isOps: false },
  { name: "balanceHistoryCache", isOps: false },
  { name: "operations", isOps: true },
  { name: "pendingOperations", isOps: true },
];

const mergeSubAccounts = (
  initialAccount: Account | undefined,
  newSubAccounts: TokenAccount[],
): Array<TokenAccount> => {
  const oldSubAccounts: Array<TokenAccount> | undefined = initialAccount?.subAccounts;
  if (!oldSubAccounts) {
    return newSubAccounts;
  }

  // Creating a map of already existing sub accounts by id
  const oldSubAccountsById: { [key: string]: TokenAccount } = {};
  for (const oldSubAccount of oldSubAccounts) {
    oldSubAccountsById[oldSubAccount.id!] = oldSubAccount;
  }

  // Looping on new sub accounts to compare them with already existing ones
  // Already existing will be updated if necessary (see `updatableSubAccountProperties`)
  // Fresh new sub accounts will be added/pushed after already existing
  const newSubAccountsToAdd: TokenAccount[] = [];
  for (const newSubAccount of newSubAccounts) {
    const duplicatedAccount: TokenAccount | undefined = oldSubAccountsById[newSubAccount.id!];

    // If this sub account was not already in the initialAccount
    if (!duplicatedAccount) {
      // We'll add it later
      newSubAccountsToAdd.push(newSubAccount);
      continue;
    }

    const updates: Partial<TokenAccount> = {};
    for (const { name, isOps } of updatableSubAccountProperties) {
      if (!isOps) {
        // @ts-expect-error FIXME: fix typings
        if (newSubAccount[name] !== duplicatedAccount[name]) {
          // @ts-expect-error FIXME: fix typings
          updates[name] = newSubAccount[name];
        }
      } else {
        // @ts-expect-error FIXME: fix typings
        updates[name] = mergeOps(duplicatedAccount[name], newSubAccount[name]);
      }
    }
    // Updating the operationsCount in case the mergeOps changed it
    updates.operationsCount =
      updates.operations?.length || duplicatedAccount?.operations?.length || 0;

    // Modifying the Map with the updated sub account with a new ref
    oldSubAccountsById[newSubAccount.id!] = {
      ...duplicatedAccount,
      ...updates,
    };
  }
  const updatedSubAccounts = Object.values(oldSubAccountsById);
  return [...updatedSubAccounts, ...newSubAccountsToAdd];
};

export const buildIterateResult: IterateResultBuilder = async ({ result: rootResult }) => {
  const accounts = await getAccountsForPublicKey(rootResult.publicKey);
  const addresses = accounts.map(a => a.accountId.toString());

  console.log("[DEBUG] coin-hedera bridge buildIterateResult - prep", { accounts, addresses });

  return async ({ currency, derivationMode, index }) => {
    const derivationScheme = getDerivationScheme({
      derivationMode,
      currency,
    });
    const freshAddressPath = runDerivationScheme(derivationScheme, currency, {
      account: index,
    });

    console.log("[DEBUG] coin-hedera bridge buildIterateResult - return", {
      derivationScheme,
      derivationMode,
      currency,
      freshAddressPath,
      output: addresses[index]
        ? ({
            address: addresses[index],
            publicKey: addresses[index],
            path: freshAddressPath,
          } as Result)
        : null,
    });

    return addresses[index]
      ? ({
          address: addresses[index],
          publicKey: addresses[index],
          path: freshAddressPath,
        } as Result)
      : null;
  };
};
