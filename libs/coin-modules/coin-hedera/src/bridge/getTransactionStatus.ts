import {
  AmountRequired,
  NotEnoughBalance,
  InvalidAddress,
  InvalidAddressBecauseDestinationIsAlsoSource,
  RecipientRequired,
  HederaRecipientTokenAssociationRequired,
  HederaRecipientTokenAssociationUnverified,
} from "@ledgerhq/errors";
import { AccountId } from "@hashgraph/sdk";
import type { Account, AccountBridge } from "@ledgerhq/types-live";
import { calculateAmount, checkAccountTokenAssociationStatus, getEstimatedFees } from "./utils";
import type { HederaOperationType, Transaction, TransactionStatus } from "../types";
import { findSubAccountById, isTokenAccount } from "@ledgerhq/coin-framework/account";
import BigNumber from "bignumber.js";

export const getTransactionStatus: AccountBridge<
  Transaction,
  Account,
  TransactionStatus
>["getTransactionStatus"] = async (account, transaction) => {
  const errors: Record<string, Error> = {};
  const warnings: Record<string, Error> = {};

  if (transaction.properties?.name === "tokenAssociate") {
    const amount = BigNumber(0);
    const estimatedFees = await getEstimatedFees(account, "TokenAssociate");
    const totalSpent = amount.plus(estimatedFees);

    return {
      amount,
      errors,
      estimatedFees,
      totalSpent,
      warnings,
    };
  }

  const subAccount = findSubAccountById(account, transaction?.subAccountId || "");
  const isTokenTransaction = isTokenAccount(subAccount);
  const operationType: HederaOperationType = isTokenTransaction
    ? "TokenTransfer"
    : "CryptoTransfer";

  if (!transaction.recipient || transaction.recipient.length === 0) {
    errors.recipient = new RecipientRequired();
  } else {
    if (account.freshAddress === transaction.recipient) {
      errors.recipient = new InvalidAddressBecauseDestinationIsAlsoSource();
    }

    try {
      AccountId.fromString(transaction.recipient);
    } catch (err) {
      errors.recipient = new InvalidAddress("", {
        currencyName: account.currency.name,
      });
    }
  }

  const [calculatedAmount, estimatedFees] = await Promise.all([
    calculateAmount({ transaction, account }),
    getEstimatedFees(account, operationType),
  ]);

  if (transaction.amount.eq(0) && !transaction.useAllAmount) {
    errors.amount = new AmountRequired();
  }

  if (isTokenTransaction) {
    if (!errors.recipient) {
      try {
        const hasRecipientTokenAssociated = await checkAccountTokenAssociationStatus(
          transaction.recipient,
          subAccount.token.contractAddress,
        );

        if (!hasRecipientTokenAssociated) {
          warnings.missingAssociation = new HederaRecipientTokenAssociationRequired();
        }
      } catch {
        warnings.unverifiedAssociation = new HederaRecipientTokenAssociationUnverified();
      }
    }

    if (subAccount.balance.isLessThan(calculatedAmount.totalSpent)) {
      errors.amount = new NotEnoughBalance();
    }

    if (account.balance.isLessThan(estimatedFees)) {
      errors.amount = new NotEnoughBalance();
    }
  } else {
    if (transaction.amount.eq(0) && !transaction.useAllAmount) {
      errors.amount = new AmountRequired();
    }

    if (account.balance.isLessThan(calculatedAmount.totalSpent)) {
      errors.amount = new NotEnoughBalance("");
    }
  }

  return {
    amount: calculatedAmount.amount,
    errors,
    estimatedFees,
    totalSpent: calculatedAmount.totalSpent,
    warnings,
  };
};
