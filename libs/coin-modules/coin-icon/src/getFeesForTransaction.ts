import { BigNumber } from "bignumber.js";
import { getFees } from "./api/node";
import { getStepPrice } from "./api/node";
import { buildTransaction } from "./buildTransaction";
import { DEFAULT_STEP_LIMIT, ICON_DUMMY_ADDRESS } from "./constants";
import { FEES_SAFETY_BUFFER, calculateAmount } from "./logic";
import type { IconAccount, Transaction } from "./types";

// A plain ICX transfer's step cost does not depend on the amount, so useAllAmount
// estimates against a nominal amount instead of the full spendable balance, which
// goloop's estimateStep cannot self-fund.
const NOMINAL_AMOUNT = new BigNumber(1);

const getEstimationAmount = ({
  account,
  transaction,
}: {
  account: IconAccount;
  transaction: Transaction;
}): BigNumber => {
  if (transaction.useAllAmount) {
    return NOMINAL_AMOUNT;
  }
  return calculateAmount({
    account,
    transaction: {
      ...transaction,
      fees: new BigNumber(0),
    },
  });
};

/**
 * Fetch the transaction fees for a transaction
 *
 * @param {IconAccount} account
 * @param {Transaction} transaction
 */
const getEstimatedFees = async ({
  account,
  transaction,
}: {
  account: IconAccount;
  transaction: Transaction;
}): Promise<BigNumber> => {
  const tx = {
    ...transaction,
    recipient: ICON_DUMMY_ADDRESS,
    // Always use a fake recipient to estimate fees
    amount: getEstimationAmount({ account, transaction }),
  };

  let stepPrice: BigNumber;
  try {
    stepPrice = await getStepPrice(account);
  } catch {
    return FEES_SAFETY_BUFFER;
  }

  let stepLimit: BigNumber | undefined;
  try {
    const { unsigned } = await buildTransaction(account, tx);
    stepLimit = await getFees(unsigned, account);
  } catch {
    stepLimit = undefined;
  }

  if (stepLimit && stepLimit.gt(0)) {
    transaction.stepLimit = stepLimit;
    return stepLimit.multipliedBy(stepPrice);
  }

  // A step limit of zero (or a failed estimate) means the node cannot simulate
  // the transaction paying for its own steps; fall back to a default limit that
  // stays in agreement with the fee returned below.
  transaction.stepLimit = new BigNumber(DEFAULT_STEP_LIMIT);
  return transaction.stepLimit.multipliedBy(stepPrice);
};

export default getEstimatedFees;
