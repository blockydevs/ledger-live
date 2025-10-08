import BigNumber from "bignumber.js";
import invariant from "invariant";
import { AccountId } from "@hashgraph/sdk";
import { findSubAccountById, isTokenAccount } from "@ledgerhq/coin-framework/account/helpers";
import {
  AmountRequired,
  NotEnoughBalance,
  InvalidAddress,
  InvalidAddressBecauseDestinationIsAlsoSource,
  RecipientRequired,
  ClaimRewardsFeesWarning,
  HederaInsufficientFundsForAssociation,
  HederaRecipientTokenAssociationRequired,
  HederaRecipientTokenAssociationUnverified,
} from "@ledgerhq/errors";
import { getEnv } from "@ledgerhq/live-env";
import type { Account, AccountBridge, TokenAccount } from "@ledgerhq/types-live";
import { HEDERA_OPERATION_TYPES, HEDERA_TRANSACTION_MODES } from "../constants";
import { HederaInvalidStakingNodeIdError, HederaRedundantStakingNodeIdError } from "../errors";
import {
  isStakingTransaction,
  isTokenAssociateTransaction,
  isTokenAssociationRequired,
} from "../logic";
import { getCurrentHederaPreloadData } from "../preload-data";
import type {
  HederaAccount,
  TransactionTokenAssociate,
  Transaction,
  TransactionStatus,
} from "../types";
import {
  calculateAmount,
  checkAccountTokenAssociationStatus,
  getCurrencyToUSDRate,
  getEstimatedFees,
} from "./utils";

type Errors = Record<string, Error>;
type Warnings = Record<string, Error>;

function validateRecipient(account: Account, recipient: string): Error | null {
  if (!recipient || recipient.length === 0) {
    return new RecipientRequired();
  }

  if (account.freshAddress === recipient) {
    return new InvalidAddressBecauseDestinationIsAlsoSource();
  }

  try {
    AccountId.fromString(recipient);
  } catch (err) {
    return new InvalidAddress("", {
      currencyName: account.currency.name,
    });
  }

  return null;
}

async function handleTokenAssociateTransaction(
  account: Account,
  transaction: TransactionTokenAssociate,
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

async function handleTokenTransaction(
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
        subAccount.token.contractAddress,
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

async function handleStakingTransaction(account: HederaAccount, transaction: Transaction) {
  invariant(isStakingTransaction(transaction), "invalid transaction properties");

  const errors: Record<string, Error> = {};
  const warnings: Record<string, Error> = {};
  const { validators } = getCurrentHederaPreloadData(account.currency);
  const estimatedFees = await getEstimatedFees(account, HEDERA_OPERATION_TYPES.CryptoUpdate);
  const amount = BigNumber(0);
  const totalSpent = amount.plus(estimatedFees);

  if (
    transaction.mode === HEDERA_TRANSACTION_MODES.Delegate ||
    transaction.mode === HEDERA_TRANSACTION_MODES.Redelegate
  ) {
    if (typeof transaction.properties?.stakingNodeId !== "number") {
      errors.missingStakingNodeId = new HederaInvalidStakingNodeIdError("Validator must be set");
    } else {
      const isValid = validators.some(validator => {
        return validator.nodeId === transaction.properties?.stakingNodeId;
      });

      if (!isValid) {
        errors.stakingNodeId = new HederaInvalidStakingNodeIdError();
      }
    }

    if (account.hederaResources?.delegation?.nodeId === transaction.properties?.stakingNodeId) {
      errors.stakingNodeId = new HederaRedundantStakingNodeIdError();
    }
  }

  if (transaction.mode === HEDERA_TRANSACTION_MODES.ClaimRewards) {
    const claimRewards = account.hederaResources?.delegation?.pendingReward || new BigNumber(0);
    const transactionFee = transaction.maxFee ?? new BigNumber(0);

    if (transactionFee.gt(claimRewards)) {
      warnings.claimRewardsFee = new ClaimRewardsFeesWarning();
    }
  }

  return {
    amount: new BigNumber(0),
    estimatedFees,
    totalSpent,
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
  const isTokenTransaction = isTokenAccount(subAccount);

  if (isTokenAssociateTransaction(transaction)) {
    return handleTokenAssociateTransaction(account, transaction);
  } else if (isStakingTransaction(transaction)) {
    return handleStakingTransaction(account, transaction);
  } else if (isTokenTransaction) {
    return handleTokenTransaction(account, subAccount, transaction);
  } else {
    return handleCoinTransaction(account, transaction);
  }
};
