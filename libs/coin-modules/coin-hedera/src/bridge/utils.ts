import BigNumber from "bignumber.js";
import type { Account, TokenAccount } from "@ledgerhq/types-live";
import cvsApi from "@ledgerhq/live-countervalues/api/index";
import { getFiatCurrencyByTicker } from "@ledgerhq/cryptoassets";
import { estimateMaxSpendable } from "./estimateMaxSpendable";
import type { Transaction } from "../types";
import { HbarUnit } from "@hashgraph/sdk";
import { findSubAccountById, isTokenAccount } from "@ledgerhq/coin-framework/account/helpers";

export const estimatedFeeSafetyRate = 2;

// FIXME:
// - check if sdk contains this type
// - understand how it is calculated
// - better getEstimatedFees usage
// - something better than TINYBAR_SCALE
export type HederaOperation = "CryptoTransfer" | "TokenTransfer";

const TINYBAR_SCALE = 8;

const baseUsdFeeByOperation: Record<HederaOperation, number> = {
  CryptoTransfer: 0.0001 * 10 ** TINYBAR_SCALE,
  TokenTransfer: 0.001 * 10 ** TINYBAR_SCALE,
} as const;

export async function getEstimatedFees(
  account: Account,
  operation: HederaOperation,
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
      return new BigNumber(baseUsdFeeByOperation[operation])
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

// FIXME: review
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
