import BigNumber from "bignumber.js";
import { findSubAccountById, isTokenAccount } from "@ledgerhq/coin-framework/account/helpers";
import { getEnv } from "@ledgerhq/live-env";
import type { AccountBridge } from "@ledgerhq/types-live";
import { HEDERA_OPERATION_TYPES, HEDERA_TRANSACTION_MODES } from "../constants";
import { isStakingTransaction, isTokenAssociateTransaction } from "../logic";
import type { Transaction } from "../types";
import { calculateAmount, getEstimatedFees } from "./utils";

const mapStakingModeToMemo = {
  [HEDERA_TRANSACTION_MODES.ClaimRewards]: "Collect Staking Rewards",
  [HEDERA_TRANSACTION_MODES.Delegate]: "Stake",
  [HEDERA_TRANSACTION_MODES.Undelegate]: "Unstake",
  [HEDERA_TRANSACTION_MODES.Redelegate]: "Restake",
} as const;

/**
 * Gather any more neccessary information for a transaction,
 * potentially from a network.
 *
 * Hedera has fully client-side transactions and the fee
 * is not possible to estimate ahead-of-time.
 *
 */
export const prepareTransaction: AccountBridge<Transaction>["prepareTransaction"] = async (
  account,
  transaction,
): Promise<Transaction> => {
  const subAccount = findSubAccountById(account, transaction?.subAccountId || "");
  const isTokenTransaction = isTokenAccount(subAccount);
  let operationType: HEDERA_OPERATION_TYPES;

  if (isTokenAssociateTransaction(transaction)) {
    operationType = HEDERA_OPERATION_TYPES.TokenAssociate;
  } else if (isTokenTransaction) {
    operationType = HEDERA_OPERATION_TYPES.TokenTransfer;
  } else {
    operationType = HEDERA_OPERATION_TYPES.CryptoTransfer;
  }

  // explicitly calculate transaction amount to account for `useAllAmount` flag (send max flow)
  // i.e. if `useAllAmount` has been toggled to true, this is where it will update the transaction to reflect that action
  const [{ amount }, estimatedFees] = await Promise.all([
    calculateAmount({ account, transaction }),
    getEstimatedFees(account, operationType),
  ]);

  // `maxFee` must be explicitly set to avoid the @hashgraph/sdk default fallback
  // this ensures device app validation passes (e.g. during swap flow)
  // it's applied via `tx.setMaxTransactionFee` when building the transaction
  transaction.maxFee = estimatedFees;

  transaction.amount = amount;

  if (isStakingTransaction(transaction)) {
    // claiming staking rewards is triggered by sending 1 tinybar to staking reward account
    if (transaction.mode === HEDERA_TRANSACTION_MODES.ClaimRewards) {
      transaction.recipient = getEnv("HEDERA_STAKING_REWARD_ACCOUNT_ID");
      transaction.amount = new BigNumber(1);
    }

    transaction.memo = mapStakingModeToMemo[transaction.mode];
  }

  return transaction;
};
