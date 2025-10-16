import BigNumber from "bignumber.js";
import {
  AmountRequired,
  NotEnoughBalance,
  InvalidAddressBecauseDestinationIsAlsoSource,
  RecipientRequired,
} from "@ledgerhq/errors";
import type { Account, AccountBridge, TokenAccount } from "@ledgerhq/types-live";
import { findSubAccountById } from "@ledgerhq/coin-framework/account";
import { getEnv } from "@ledgerhq/live-env";
import { HEDERA_OPERATION_TYPES, HEDERA_TRANSACTION_MODES } from "../constants";
import {
  HederaInsufficientFundsForAssociation,
  HederaRecipientTokenAssociationRequired,
  HederaRecipientTokenAssociationUnverified,
  HederaRecipientEvmAddressVerificationRequired,
} from "../errors";
import { isTokenAssociateTransaction, isTokenAssociationRequired } from "../logic";
import type { Transaction, TransactionStatus } from "../types";
import {
  calculateAmount,
  checkAccountTokenAssociationStatus,
  getCurrencyToUSDRate,
  getERC20EstimatedFees,
  getEstimatedFees,
  safeParseAccountId,
} from "./utils";

type Errors = Record<string, Error>;
type Warnings = Record<string, Error>;

function validateRecipient(account: Account, recipient: string): Error | null {
  if (!recipient || recipient.length === 0) {
    return new RecipientRequired();
  }

  const [parsingError, parsingResult] = safeParseAccountId(recipient);

  if (parsingError) {
    return parsingError;
  }

  const recipientWithoutChecksum = parsingResult.accountId;

  if (account.freshAddress === recipientWithoutChecksum) {
    return new InvalidAddressBecauseDestinationIsAlsoSource();
  }

  return null;
}

async function handleTokenAssociateTransaction(
  account: Account,
  transaction: Extract<Transaction, { mode: typeof HEDERA_TRANSACTION_MODES.TokenAssociate }>,
): Promise<TransactionStatus> {
  const errors: Errors = {};
  const warnings: Warnings = {};

  const [usdRate, estimatedFees] = await Promise.all([
    getCurrencyToUSDRate(account.currency),
    getEstimatedFees(account, HEDERA_OPERATION_TYPES.TokenAssociate),
  ]);

  const amount = BigNumber(0);
  const totalSpent = amount.plus(estimatedFees);
  const isAssociationFlow = isTokenAssociationRequired(account, transaction.properties.token);

  if (isAssociationFlow) {
    const hbarBalance = account.balance.dividedBy(10 ** account.currency.units[0].magnitude);
    const currentWorthInUSD = usdRate ? hbarBalance.multipliedBy(usdRate) : new BigNumber(0);
    const requiredWorthInUSD = getEnv("HEDERA_TOKEN_ASSOCIATION_MIN_USD");

    if (currentWorthInUSD.isLessThan(requiredWorthInUSD)) {
      errors.insufficientAssociateBalance = new HederaInsufficientFundsForAssociation("", {
        requiredWorthInUSD,
      });
    }
  }

  return {
    amount,
    totalSpent,
    estimatedFees,
    errors,
    warnings,
  };
}

async function handleHTSTokenTransaction(
  account: Account,
  subAccount: TokenAccount,
  transaction: Transaction,
): Promise<TransactionStatus> {
  const errors: Errors = {};
  const warnings: Warnings = {};

  const [calculatedAmount, estimatedFees] = await Promise.all([
    calculateAmount({ transaction, account }),
    getEstimatedFees(account, HEDERA_OPERATION_TYPES.TokenTransfer),
  ]);

  const recipientError = validateRecipient(account, transaction.recipient);

  if (recipientError) {
    errors.recipient = recipientError;
  }

  if (!errors.recipient) {
    try {
      const hasRecipientTokenAssociated = await checkAccountTokenAssociationStatus(
        transaction.recipient,
        subAccount.token,
      );

      if (!hasRecipientTokenAssociated) {
        warnings.missingAssociation = new HederaRecipientTokenAssociationRequired();
      }
    } catch {
      warnings.unverifiedAssociation = new HederaRecipientTokenAssociationUnverified();
    }
  }

  if (transaction.amount.eq(0)) {
    errors.amount = new AmountRequired();
  }

  if (subAccount.balance.isLessThan(calculatedAmount.totalSpent)) {
    errors.amount = new NotEnoughBalance();
  }

  if (account.balance.isLessThan(estimatedFees)) {
    errors.amount = new NotEnoughBalance();
  }

  return {
    amount: calculatedAmount.amount,
    totalSpent: calculatedAmount.totalSpent,
    estimatedFees,
    errors,
    warnings,
  };
}

async function handleERC20TokenTransaction(
  account: Account,
  subAccount: TokenAccount,
  transaction: Transaction,
): Promise<TransactionStatus> {
  const errors: Errors = {};
  const warnings: Warnings = {
    unverifiedEvmAddress: new HederaRecipientEvmAddressVerificationRequired(),
  };

  const [calculatedAmount, estimatedFees] = await Promise.all([
    calculateAmount({ transaction, account }),
    getERC20EstimatedFees(account, transaction),
  ]);

  const recipientError = validateRecipient(account, transaction.recipient);

  if (recipientError) {
    errors.recipient = recipientError;
  }

  if (transaction.amount.eq(0)) {
    errors.amount = new AmountRequired();
  }

  if (subAccount.balance.isLessThan(calculatedAmount.totalSpent)) {
    errors.amount = new NotEnoughBalance();
  }

  if (account.balance.isLessThan(estimatedFees.tinybars)) {
    errors.amount = new NotEnoughBalance();
  }

  return {
    amount: calculatedAmount.amount,
    totalSpent: calculatedAmount.totalSpent,
    estimatedFees: estimatedFees.tinybars,
    errors,
    warnings,
  };
}

async function handleCoinTransaction(
  account: Account,
  transaction: Transaction,
): Promise<TransactionStatus> {
  const errors: Errors = {};
  const warnings: Warnings = {};

  const [calculatedAmount, estimatedFees] = await Promise.all([
    calculateAmount({ transaction, account }),
    getEstimatedFees(account, HEDERA_OPERATION_TYPES.CryptoTransfer),
  ]);

  const recipientError = validateRecipient(account, transaction.recipient);

  if (recipientError) {
    errors.recipient = recipientError;
  }

  if (transaction.amount.eq(0) && !transaction.useAllAmount) {
    errors.amount = new AmountRequired();
  }

  if (account.balance.isLessThan(calculatedAmount.totalSpent)) {
    errors.amount = new NotEnoughBalance("");
  }

  return {
    amount: calculatedAmount.amount,
    totalSpent: calculatedAmount.totalSpent,
    estimatedFees,
    errors,
    warnings,
  };
}

export const getTransactionStatus: AccountBridge<
  Transaction,
  Account,
  TransactionStatus
>["getTransactionStatus"] = async (account, transaction) => {
  const subAccount = findSubAccountById(account, transaction?.subAccountId || "");
  const isHTSTokenTransaction =
    transaction.mode === HEDERA_TRANSACTION_MODES.Send && subAccount?.token.tokenType === "hts";
  const isERC20TokenTransaction =
    transaction.mode === HEDERA_TRANSACTION_MODES.Send && subAccount?.token.tokenType === "erc20";

  if (isTokenAssociateTransaction(transaction)) {
    return handleTokenAssociateTransaction(account, transaction);
  } else if (isHTSTokenTransaction) {
    return handleHTSTokenTransaction(account, subAccount, transaction);
  } else if (isERC20TokenTransaction) {
    return handleERC20TokenTransaction(account, subAccount, transaction);
  } else {
    return handleCoinTransaction(account, transaction);
  }
};
