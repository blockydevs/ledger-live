import BigNumber from "bignumber.js";
import type { AccountBridge, CurrencyBridge, Account } from "@ledgerhq/types-live";
import {
  AmountRequired,
  HederaInsufficientFundsForAssociation,
  HederaRecipientTokenAssociationRequired,
  HederaRecipientTokenAssociationUnverified,
  InvalidAddress,
  InvalidAddressBecauseDestinationIsAlsoSource,
  NotEnoughBalance,
  RecipientRequired,
} from "@ledgerhq/errors";
import { HederaAccount, Transaction as HederaTransaction } from "@ledgerhq/coin-hedera/types";
import { checkAccountTokenAssociationStatus } from "@ledgerhq/coin-hedera/bridge/utils";
import {
  getSerializedAddressParameters,
  updateTransaction,
} from "@ledgerhq/coin-framework/bridge/jsHelpers";
import {
  scanAccounts,
  signOperation,
  broadcast,
  sync,
  makeAccountBridgeReceive,
} from "../../../bridge/mockHelpers";
import { isTokenAssociateTransaction, isTokenAssociationRequired } from "../logic";
import { getEnv } from "@ledgerhq/live-env";
import { findSubAccountById, isTokenAccount } from "../../../account";
import { HEDERA_OPERATION_TYPES } from "../constants";

const getMockedFees = (operationType: HEDERA_OPERATION_TYPES) => {
  switch (operationType) {
    case HEDERA_OPERATION_TYPES.CryptoTransfer:
      return new BigNumber(1);
    case HEDERA_OPERATION_TYPES.TokenTransfer:
      return new BigNumber(2);
    case HEDERA_OPERATION_TYPES.TokenAssociate:
      return new BigNumber(3);
  }
};

const receive = makeAccountBridgeReceive();

const createTransaction = (): HederaTransaction => {
  return {
    family: "hedera",
    amount: new BigNumber(100),
    recipient: "",
    useAllAmount: false,
  };
};

const estimateMaxSpendable = ({ account }) => {
  return account.balance;
};

export const getTransactionStatus = async (
  account: HederaAccount,
  transaction: HederaTransaction,
) => {
  const errors: Record<string, Error> = {};
  const warnings: Record<string, Error> = {};

  if (isTokenAssociateTransaction(transaction)) {
    const usdRate = new BigNumber(1);
    const estimatedFees = getMockedFees(HEDERA_OPERATION_TYPES.TokenAssociate);

    const amount = BigNumber(0);
    const totalSpent = amount.plus(estimatedFees);
    const hbarBalance = account.balance.dividedBy(10 ** account.currency.units[0].magnitude);
    const currentWorthInUSD = hbarBalance.multipliedBy(usdRate);
    const requiredWorthInUSD = getEnv("HEDERA_TOKEN_ASSOCIATION_MIN_USD");
    const isAssociationFlow = isTokenAssociationRequired(account, transaction.properties.token);

    if (isAssociationFlow && currentWorthInUSD.isLessThan(requiredWorthInUSD)) {
      errors.insufficientAssociateBalance = new HederaInsufficientFundsForAssociation("", {
        requiredWorthInUSD,
      });
    }

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

  if (!transaction.recipient || transaction.recipient.length === 0) {
    errors.recipient = new RecipientRequired();
  } else {
    if (account.freshAddress === transaction.recipient) {
      errors.recipient = new InvalidAddressBecauseDestinationIsAlsoSource();
    }

    try {
      // @ts-expect-error - tmp
      AccountId.fromString(transaction.recipient);
    } catch (err) {
      errors.recipient = new InvalidAddress("", {
        currencyName: account.currency.name,
      });
    }
  }

  const [calculatedAmount, estimatedFees] = [new BigNumber(100), new BigNumber(0)];

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

    if (transaction.amount.eq(0)) {
      errors.amount = new AmountRequired();
    }

    // @ts-expect-error - tmp
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

    // @ts-expect-error - tmp
    if (account.balance.isLessThan(calculatedAmount.totalSpent)) {
      errors.amount = new NotEnoughBalance("");
    }
  }

  return {
    // @ts-expect-error - tmp
    amount: calculatedAmount.amount,
    errors,
    estimatedFees,
    // @ts-expect-error - tmp
    totalSpent: calculatedAmount.totalSpent,
    warnings,
  };
};

const prepareTransaction = async (account: Account, transaction: HederaTransaction) => {
  transaction.amount = new BigNumber(100);
  return transaction;
};

const accountBridge: AccountBridge<HederaTransaction> = {
  createTransaction,
  updateTransaction,
  getTransactionStatus,
  estimateMaxSpendable,
  prepareTransaction,
  sync,
  receive,
  signOperation,
  broadcast,
  getSerializedAddressParameters,
};

const currencyBridge: CurrencyBridge = {
  preload: () => Promise.resolve({}),
  hydrate: () => {},
  scanAccounts,
};

export default {
  accountBridge,
  currencyBridge,
};
