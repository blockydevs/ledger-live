import type { Account, AccountBridge, TokenAccount } from "@ledgerhq/types-live";
import type { Transaction } from "../types";
import { calculateAmount } from "./utils";
import { findSubAccountById, isTokenAccount } from "@ledgerhq/coin-framework/account/helpers";

const prepareCoinTransaction = async (
  account: Account,
  transaction: Transaction,
): Promise<Transaction> => {
  console.log("[DEBUG] coin-hedera prepareCoinTransaction", { transaction });

  // explicitly calculate transaction amount to account for `useAllAmount` flag (send max flow)
  // i.e. if `useAllAmount` has been toggled to true, this is where it will update the transaction to reflect that action
  const { amount } = await calculateAmount({ account, transaction });
  transaction.amount = amount;

  return transaction;
};

const prepareTokenTransaction = async (
  account: Account,
  tokenAccount: TokenAccount,
  transaction: Transaction,
): Promise<Transaction> => {
  console.log("[DEBUG] coin-hedera prepareTokenTransaction", { transaction });

  // FIXME: comment, logic
  transaction.amount = transaction.useAllAmount ? tokenAccount.balance : transaction.amount;

  return transaction;
};

/**
 * Gather any more neccessary information for a transaction,
 * potentially from a network.
 *
 * Hedera has fully client-side transactions and the fee
 * is not possible to estimate ahead-of-time.
 *
 * @returns  {Transaction}
 */
export const prepareTransaction: AccountBridge<Transaction>["prepareTransaction"] = async (
  account,
  transaction,
) => {
  const subAccount = findSubAccountById(account, transaction.subAccountId || "");
  const isTokenTransaction = isTokenAccount(subAccount);

  return isTokenTransaction
    ? prepareTokenTransaction(account, subAccount, transaction)
    : prepareCoinTransaction(account, transaction);
};
