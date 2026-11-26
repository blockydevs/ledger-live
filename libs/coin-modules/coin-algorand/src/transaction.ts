import { formatCurrencyUnit } from "@ledgerhq/coin-module-framework/currencies/index";
import { getAccountCurrency } from "@ledgerhq/ledger-wallet-framework/account/index";
import { formatTransactionStatus } from "@ledgerhq/ledger-wallet-framework/formatters";
import {
  fromTransactionCommonRaw,
  fromTransactionStatusRawCommon as fromTransactionStatusRaw,
  toTransactionCommonRaw,
  toTransactionStatusRawCommon as toTransactionStatusRaw,
} from "@ledgerhq/ledger-wallet-framework/serialization";
import type { Account } from "@ledgerhq/types-live";
import BigNumber from "bignumber.js";
import type { AlgorandTransaction, AlgorandTransactionRaw } from "./types";
export const formatTransaction = (
  { mode, subAccountId, amount, recipient, fees, useAllAmount }: AlgorandTransaction,
  mainAccount: Account,
): string => {
  const account =
    (subAccountId && (mainAccount.subAccounts || []).find(a => a.id === subAccountId)) ||
    mainAccount;
  return `
    ${mode === "optIn" ? "OPT_IN" : "SEND"} ${
      useAllAmount
        ? "MAX"
        : formatCurrencyUnit(getAccountCurrency(account).units[0], amount, {
            showCode: true,
            disableRounding: false,
          })
    }
    TO ${recipient}
    with fees=${
      !fees
        ? "?"
        : formatCurrencyUnit(mainAccount.currency.units[0], fees, {
            showCode: true,
            disableRounding: false,
          })
    }`;
};

const fromTransactionRaw = (tr: AlgorandTransactionRaw): AlgorandTransaction => {
  const common = fromTransactionCommonRaw(tr);
  return {
    ...common,
    family: tr.family,
    fees: tr.fees ? new BigNumber(tr.fees) : null,
    memo: tr.memo,
    mode: tr.mode,
    assetId: tr.assetId,
    // Algorand has no account sequence: a missing nonce would send the generic `signOperation`
    // into `getNextSequence`, which coin-algorand does not implement.
    nonce: tr.nonce ? new BigNumber(tr.nonce) : new BigNumber(0),
    memoType: tr.memoType,
    memoValue: tr.memoValue,
    assetReference: tr.assetReference,
    assetOwner: tr.assetOwner,
  };
};

const toTransactionRaw = (t: AlgorandTransaction): AlgorandTransactionRaw => {
  const common = toTransactionCommonRaw(t);
  return {
    ...common,
    family: t.family,
    fees: t.fees ? t.fees.toString() : null,
    memo: t.memo,
    mode: t.mode,
    assetId: t.assetId,
    ...(t.nonce ? { nonce: t.nonce.toFixed() } : {}),
    memoType: t.memoType,
    memoValue: t.memoValue,
    assetReference: t.assetReference,
    assetOwner: t.assetOwner,
  };
};

export default {
  formatTransaction,
  fromTransactionRaw,
  toTransactionRaw,
  fromTransactionStatusRaw,
  toTransactionStatusRaw,
  formatTransactionStatus,
};
