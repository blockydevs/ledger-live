import { findSubAccountById } from "@ledgerhq/coin-framework/account/helpers";
import type { AccountBridge } from "@ledgerhq/types-live";
import { HEDERA_OPERATION_TYPES, HEDERA_TRANSACTION_MODES } from "../constants";
import { isTokenAssociateTransaction } from "../logic";
import type { Transaction } from "../types";
import { calculateAmount, getEstimatedFees, getERC20EstimatedFees } from "./utils";

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
  let operationType: HEDERA_OPERATION_TYPES;
  const subAccount = findSubAccountById(account, transaction?.subAccountId || "");
  const isHTSTokenTransaction =
    transaction.mode === HEDERA_TRANSACTION_MODES.Send && subAccount?.token.tokenType === "hts";
  const isERC20TokenTransaction =
    transaction.mode === HEDERA_TRANSACTION_MODES.Send && subAccount?.token.tokenType === "erc20";

  if (isTokenAssociateTransaction(transaction)) {
    operationType = HEDERA_OPERATION_TYPES.TokenAssociate;
  } else if (isHTSTokenTransaction) {
    operationType = HEDERA_OPERATION_TYPES.TokenTransfer;
  } else if (isERC20TokenTransaction) {
    operationType = HEDERA_OPERATION_TYPES.ContractCall;
  } else {
    operationType = HEDERA_OPERATION_TYPES.CryptoTransfer;
  }

  // explicitly calculate transaction amount to account for `useAllAmount` flag (send max flow)
  // i.e. if `useAllAmount` has been toggled to true, this is where it will update the transaction to reflect that action
  const [calculatedAmount, estimatedFees] = await Promise.all([
    calculateAmount({ account, transaction }),
    getEstimatedFees(account, operationType),
  ]);

  transaction.amount = calculatedAmount.amount;

  // `maxFee` must be explicitly set to avoid the @hashgraph/sdk default fallback
  // this ensures device app validation passes (e.g. during swap flow)
  // it's applied via `tx.setMaxTransactionFee` when building the transaction
  transaction.maxFee = estimatedFees;

  // ERC20 transactions require gas limit and fee calculated based on gas
  if (isERC20TokenTransaction) {
    const erc20Fees = await getERC20EstimatedFees(account, transaction);
    transaction.gasLimit = erc20Fees.gas;
    transaction.maxFee = erc20Fees.tinybars;
  }

  return transaction;
};
