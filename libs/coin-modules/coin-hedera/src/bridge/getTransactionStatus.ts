import {
  AmountRequired,
  NotEnoughBalance,
  InvalidAddress,
  InvalidAddressBecauseDestinationIsAlsoSource,
  RecipientRequired,
} from "@ledgerhq/errors";
import { AccountId } from "@hashgraph/sdk";
import type { AccountBridge } from "@ledgerhq/types-live";
import { calculateAmount, getEstimatedFees } from "./utils";
import type { Transaction } from "../types";

export const getTransactionStatus: AccountBridge<Transaction>["getTransactionStatus"] = async (
  account,
  transaction,
) => {
  const errors: Record<string, Error> = {};

  if (!transaction.recipient || transaction.recipient.length === 0) {
    errors.recipient = new RecipientRequired("");
  } else {
    if (account.freshAddress === transaction.recipient) {
      errors.recipient = new InvalidAddressBecauseDestinationIsAlsoSource("");
    }

    try {
      AccountId.fromString(transaction.recipient);
    } catch (err) {
      errors.recipient = new InvalidAddress("", {
        currencyName: account.currency.name,
      });
    }
  }

  const { amount, totalSpent } = await calculateAmount({
    transaction,
    account,
  });

  if (transaction.amount.eq(0) && !transaction.useAllAmount) {
    errors.amount = new AmountRequired();
  } else if (account.balance.isLessThan(totalSpent)) {
    errors.amount = new NotEnoughBalance("");
  }

  // FIXME:
  // 1. verify coin & token balance
  // 2. see if token is associated based on https://mainnet-public.mirrornode.hedera.com/api/v1/accounts/0.0.9124531/tokens
  // remember about cache, see how often this runs

  // FIXME:
  const estimatedFees = await getEstimatedFees(account, "CryptoTransfer");

  console.log("[DEBUG] getTransactionStatus", {
    amount,
    errors,
    estimatedFees,
    totalSpent,
    warnings: {},
  });

  return {
    amount,
    errors,
    estimatedFees,
    totalSpent,
    warnings: {},
  };
};
