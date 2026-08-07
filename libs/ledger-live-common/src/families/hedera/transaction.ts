import { formatCurrencyUnit } from "@ledgerhq/coin-module-framework/currencies/index";
import { getAccountCurrency } from "@ledgerhq/ledger-wallet-framework/account/index";
import { formatTransactionStatus } from "@ledgerhq/ledger-wallet-framework/formatters";
import {
  fromTransactionCommonRaw,
  fromTransactionStatusRawCommon as fromTransactionStatusRaw,
  toTransactionCommonRaw,
  toTransactionStatusRawCommon as toTransactionStatusRaw,
} from "@ledgerhq/ledger-wallet-framework/serialization";

export { fromTransactionStatusRaw, toTransactionStatusRaw };
import type { Account } from "@ledgerhq/types-live";
import { BigNumber } from "bignumber.js";
import type { Transaction, TransactionRaw } from "./types";

export function formatTransaction(
  { amount, recipient, useAllAmount }: Transaction,
  account: Account,
): string {
  return `
SEND ${
    useAllAmount
      ? "MAX"
      : formatCurrencyUnit(getAccountCurrency(account).units[0], amount, {
          showCode: true,
          disableRounding: true,
        })
  }
TO ${recipient}`;
}

export function fromTransactionRaw(rawTx: TransactionRaw): Transaction {
  const common = fromTransactionCommonRaw(rawTx);
  const tx: Transaction = {
    ...common,
    family: rawTx.family,
    mode: rawTx.mode,
  };

  // `null` is distinct from absent here: the account bridge sets `fees: null` before estimation,
  // and a round trip through the raw form has to preserve that.
  if (rawTx.fees !== undefined) {
    tx.fees = rawTx.fees === null ? null : new BigNumber(rawTx.fees);
  }

  if (rawTx.gasLimit) {
    tx.gasLimit = new BigNumber(rawTx.gasLimit);
  }

  if (rawTx.nonce !== null && rawTx.nonce !== undefined) {
    tx.nonce = new BigNumber(rawTx.nonce);
  }

  if (rawTx.memoType) {
    tx.memoType = rawTx.memoType;
  }

  if (rawTx.memoValue) {
    tx.memoValue = rawTx.memoValue;
  }

  if (rawTx.valId) {
    tx.valId = rawTx.valId;
  }

  if (rawTx.assetReference) {
    tx.assetReference = rawTx.assetReference;
  }

  if (rawTx.assetOwner) {
    tx.assetOwner = rawTx.assetOwner;
  }

  return tx;
}

export function toTransactionRaw(tx: Transaction): TransactionRaw {
  const common = toTransactionCommonRaw(tx);
  const raw: TransactionRaw = {
    ...common,
    family: tx.family,
    mode: tx.mode,
  };

  if (tx.fees !== undefined) {
    raw.fees = tx.fees === null ? null : tx.fees.toFixed();
  }

  if (tx.gasLimit) {
    raw.gasLimit = tx.gasLimit.toFixed();
  }

  if (tx.nonce !== null && tx.nonce !== undefined) {
    raw.nonce = tx.nonce.toFixed();
  }

  if (tx.memoType) {
    raw.memoType = tx.memoType;
  }

  if (tx.memoValue) {
    raw.memoValue = tx.memoValue;
  }

  if (tx.valId) {
    raw.valId = tx.valId;
  }

  if (tx.assetReference) {
    raw.assetReference = tx.assetReference;
  }

  if (tx.assetOwner) {
    raw.assetOwner = tx.assetOwner;
  }

  return raw;
}

export default {
  formatTransaction,
  fromTransactionRaw,
  toTransactionRaw,
  toTransactionStatusRaw,
  formatTransactionStatus,
  fromTransactionStatusRaw,
};
