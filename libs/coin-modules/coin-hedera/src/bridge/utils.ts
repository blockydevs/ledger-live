import BigNumber from "bignumber.js";
import type { Account, Operation, TokenAccount } from "@ledgerhq/types-live";
import cvsApi from "@ledgerhq/live-countervalues/api/index";
import { findTokenByAddressInCurrency, getFiatCurrencyByTicker } from "@ledgerhq/cryptoassets";
import {
  decodeTokenAccountId,
  emptyHistoryCache,
  encodeTokenAccountId,
  findSubAccountById,
  isTokenAccount,
} from "@ledgerhq/coin-framework/account";
import { encodeOperationId } from "@ledgerhq/coin-framework/operation";
import { TokenCurrency } from "@ledgerhq/types-cryptoassets";
import { mergeOps } from "@ledgerhq/coin-framework/bridge/jsHelpers";
import { makeLRUCache, minutes } from "@ledgerhq/live-network/cache";
import { AccountBalance } from "../api/network";
import { estimateMaxSpendable } from "./estimateMaxSpendable";
import type { HederaOperationType, HederaOperationExtra, Transaction } from "../types";
import { getAccount } from "../api/mirror";

export const estimatedFeeSafetyRate = 2;

const TINYBAR_SCALE = 8;
const BASE_USD_FEE_BY_OPERATION_TYPE: Record<HederaOperationType, number> = {
  CryptoTransfer: 0.0001 * 10 ** TINYBAR_SCALE,
  TokenTransfer: 0.001 * 10 ** TINYBAR_SCALE,
  TokenAssociate: 0.05 * 10 ** TINYBAR_SCALE,
} as const;

export async function getEstimatedFees(
  account: Account,
  operationType: HederaOperationType,
): Promise<BigNumber> {
  try {
    const data = await cvsApi.fetchLatest([
      {
        from: account.currency,
        to: getFiatCurrencyByTicker("USD"),
        startDate: new Date(),
      },
    ]);

    if (data[0]) {
      return new BigNumber(BASE_USD_FEE_BY_OPERATION_TYPE[operationType])
        .dividedBy(new BigNumber(data[0]))
        .integerValue(BigNumber.ROUND_CEIL)
        .multipliedBy(estimatedFeeSafetyRate);
    }
    // eslint-disable-next-line no-empty
  } catch {}

  // as fees are based on a currency conversion, we stay
  // on the safe side here and double the estimate for "max spendable"
  return new BigNumber("150200").multipliedBy(estimatedFeeSafetyRate); // 0.001502 ℏ (as of 2023-03-14)
}

interface CalculateAmountResult {
  amount: BigNumber;
  totalSpent: BigNumber;
}

async function calculateCoinAmount({
  account,
  transaction,
}: {
  account: Account;
  transaction: Transaction;
}): Promise<CalculateAmountResult> {
  const estimatedFee = await getEstimatedFees(account, "CryptoTransfer");
  const amount = transaction.useAllAmount
    ? await estimateMaxSpendable({ account, transaction })
    : transaction.amount;

  return {
    amount,
    totalSpent: amount.plus(estimatedFee),
  };
}

async function calculateTokenAmount({
  account,
  tokenAccount,
  transaction,
}: {
  account: Account;
  tokenAccount: TokenAccount;
  transaction: Transaction;
}): Promise<CalculateAmountResult> {
  const amount = transaction.useAllAmount
    ? await estimateMaxSpendable({ account: tokenAccount, parentAccount: account, transaction })
    : transaction.amount;

  return {
    amount,
    totalSpent: amount,
  };
}

export async function calculateAmount({
  account,
  transaction,
}: {
  account: Account;
  transaction: Transaction;
}): Promise<CalculateAmountResult> {
  const subAccount = findSubAccountById(account, transaction?.subAccountId || "");
  const isTokenTransaction = isTokenAccount(subAccount);

  return isTokenTransaction
    ? calculateTokenAmount({ account, tokenAccount: subAccount, transaction })
    : calculateCoinAmount({ account, transaction });
}

// NOTE: convert from the non-url-safe version of base64 to the url-safe version (that the explorer uses)
export function base64ToUrlSafeBase64(data: string): string {
  // Might be nice to use this alternative if .nvmrc changes to >= Node v14.18.0
  // base64url encoding option isn't supported until then
  // Buffer.from(data, "base64").toString("base64url");

  return data.replace(/\//g, "_").replace(/\+/g, "-");
}

export const getSubAccounts = async (
  accountId: string,
  lastTokenOperations: Operation[],
  accountBalance: AccountBalance,
): Promise<TokenAccount[]> => {
  // Creating a Map of Operations by TokenCurrencies in order to know which TokenAccounts should be synced as well
  const operationsByToken = lastTokenOperations.reduce<Map<TokenCurrency, Operation[]>>(
    (acc, tokenOperation) => {
      const { token } = decodeTokenAccountId(tokenOperation.accountId);
      if (!token) return acc;

      const isTokenListedInCAL = findTokenByAddressInCurrency(
        token.contractAddress,
        token.parentCurrency.id,
      );
      if (!isTokenListedInCAL) return acc;

      if (!acc.has(token)) {
        acc.set(token, []);
      }

      acc.get(token)?.push(tokenOperation);

      return acc;
    },
    new Map<TokenCurrency, Operation[]>(),
  );

  const subAccounts: TokenAccount[] = [];

  // extract token accounts from existing operations
  for (const [token, tokenOperations] of operationsByToken.entries()) {
    const parentAccountId = accountId;
    const balance = accountBalance.tokens.find(t => t.tokenId === token.contractAddress)?.balance;

    if (balance === undefined) {
      continue;
    }

    subAccounts.push({
      type: "TokenAccount",
      id: encodeTokenAccountId(parentAccountId, token),
      parentId: parentAccountId,
      token,
      balance,
      spendableBalance: balance,
      creationDate: new Date(),
      operations: tokenOperations,
      operationsCount: tokenOperations.length,
      pendingOperations: [],
      balanceHistoryCache: emptyHistoryCache,
      swapHistory: [],
    });
  }

  // extract token accounts existing in the account's balance, but with no recorded operations yet
  // e.g. tokens added via association flow, without any subsequent activity
  for (const rawToken of accountBalance.tokens) {
    const parentAccountId = accountId;
    const balance = rawToken.balance;
    const token = findTokenByAddressInCurrency(rawToken.tokenId, "hedera");

    if (!token) {
      continue;
    }

    const id = encodeTokenAccountId(parentAccountId, token);

    if (subAccounts.some(a => a.id === id)) {
      continue;
    }

    subAccounts.push({
      type: "TokenAccount",
      id: encodeTokenAccountId(parentAccountId, token),
      parentId: parentAccountId,
      token,
      balance,
      spendableBalance: balance,
      creationDate: new Date(),
      operations: [],
      operationsCount: 0,
      pendingOperations: [],
      balanceHistoryCache: emptyHistoryCache,
      swapHistory: [],
    });
  }

  return subAccounts;
};

// based on libs/coin-modules/coin-evm/src/logic.ts
export const linkSubOperationsToCoinOperations = (
  _coinOperations: Operation[],
  _tokenOperations: Operation[],
): Operation[] => {
  // Creating deep copies of each Operation[] to prevent mutating the originals
  const coinOperations = _coinOperations.map(op => ({ ...op }));
  const tokenOperations = _tokenOperations.map(op => ({ ...op }));

  type OperationWithRequiredChildren = Operation &
    Required<Pick<Operation, "nftOperations" | "subOperations" | "internalOperations">>;

  // Helper to create a coin operation with type NONE as a parent of an orphan child operation
  const makeCoinOpForOrphanChildOp = (childOp: Operation): OperationWithRequiredChildren => {
    const type = "NONE";
    const { accountId } = decodeTokenAccountId(childOp.accountId);
    const id = encodeOperationId(accountId, childOp.hash, type);

    return {
      id,
      hash: childOp.hash,
      type,
      value: new BigNumber(0),
      fee: new BigNumber(0),
      senders: [],
      recipients: [],
      blockHeight: childOp.blockHeight,
      blockHash: childOp.blockHash,
      transactionSequenceNumber: childOp.transactionSequenceNumber,
      subOperations: [],
      nftOperations: [],
      internalOperations: [],
      accountId: "",
      date: childOp.date,
      extra: {},
    };
  };

  // Create a Map of hash => operation
  const coinOperationsByHash: Record<string, OperationWithRequiredChildren[]> = {};
  coinOperations.forEach(op => {
    if (!coinOperationsByHash[op.hash]) {
      coinOperationsByHash[op.hash] = [];
    }

    // Adding arrays just in case but this is defined
    // by the adapters so it should never be needed
    op.subOperations = [];
    op.nftOperations = [];
    op.internalOperations = [];
    coinOperationsByHash[op.hash].push(op as OperationWithRequiredChildren);
  });

  // Looping through token operations to potentially copy them as a child operation of a coin operation
  for (const tokenOperation of tokenOperations) {
    const { token } = decodeTokenAccountId(tokenOperation.accountId);
    if (!token) continue;

    let mainOperations = coinOperationsByHash[tokenOperation.hash];
    if (!mainOperations?.length) {
      const noneOperation = makeCoinOpForOrphanChildOp(tokenOperation);
      mainOperations = [noneOperation];
      coinOperations.push(noneOperation);
    }

    // Ugly loop in loop but in theory, this can only be a 2 elements array maximum in the case of a self send
    for (const mainOperation of mainOperations) {
      mainOperation.subOperations.push(tokenOperation);
    }
  }

  return coinOperations;
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

// based on libs/coin-modules/coin-evm/src/logic.ts
export const mergeSubAccounts = (
  initialAccount: Account | undefined,
  newSubAccounts: TokenAccount[],
): Array<TokenAccount> => {
  const oldSubAccounts: Array<TokenAccount> | undefined = initialAccount?.subAccounts;

  if (!oldSubAccounts) {
    return newSubAccounts;
  }

  // Creating a map of already existing sub accounts by id
  const oldSubAccountsById: Record<string, TokenAccount> = {};
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

export const applyPendingExtras = (existing: Operation[], pending: Operation[]) => {
  const pendingMap = new Map(pending.map(op => [op.hash, op]));

  return existing.map(op => {
    const pendingOp = pendingMap.get(op.hash);
    if (!pendingOp) return op;
    if (!op.extra || typeof op.extra !== "object") return op;
    if (!pendingOp.extra || typeof pendingOp.extra !== "object") return op;

    return {
      ...op,
      extra: {
        ...pendingOp.extra,
        ...op.extra,
      },
    };
  });
};

export const checkAccountTokenAssociationStatus = makeLRUCache(
  async (accountId: string, tokenId: string) => {
    const accountDetails = await getAccount(accountId);

    // auto association is enabled
    if (accountDetails.maxAutomaticTokenAssociations === -1) {
      return true;
    }

    const isTokenAssociated = accountDetails.tokens.some(token => token.tokenId === tokenId);

    return isTokenAssociated;
  },
  (accountId, tokenId) => `${accountId}-${tokenId}`,
  minutes(1),
);

export function patchOperationWithExtra(
  operation: Operation,
  extra: HederaOperationExtra,
): Operation {
  return {
    ...operation,
    extra,
    subOperations: (operation.subOperations ?? []).map(op => ({ ...op, extra })),
    nftOperations: (operation.nftOperations ?? []).map(op => ({ ...op, extra })),
  };
}
