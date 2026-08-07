import {
  AmountRequired,
  InvalidAddressBecauseDestinationIsAlsoSource,
  NotEnoughBalance,
  RecipientRequired,
} from "@ledgerhq/ledger-wallet-framework/errors";
import { ClaimRewardsFeesWarning } from "../errors";
import type {
  Balance,
  FeeEstimation,
  TransactionIntent,
  TransactionValidation,
} from "@ledgerhq/coin-module-framework/api/types";
import { findCryptoCurrencyById } from "@ledgerhq/ledger-wallet-framework/currencies";
import type { TokenCurrency } from "@ledgerhq/ledger-wallet-framework/types";
import { getEnv } from "@ledgerhq/live-env";
import BigNumber from "bignumber.js";
import invariant from "invariant";
import type { HederaCoinConfig } from "../config";
import { HEDERA_OPERATION_TYPES, HEDERA_TRANSACTION_MODES } from "../constants";
import {
  HederaInsufficientFundsForAssociation,
  HederaInvalidStakingNodeIdError,
  HederaMemoExceededSizeError,
  HederaNoStakingRewardsError,
  HederaRecipientEvmAddressVerificationRequired,
  HederaRecipientTokenAssociationRequired,
  HederaRecipientTokenAssociationUnverified,
  HederaRedundantStakingNodeIdError,
} from "../errors";
import {
  checkAccountTokenAssociationStatus,
  getCurrencyToUSDRate,
  safeParseAccountId,
} from "../network/utils";
import type { HederaMemo, HederaTxData } from "../types";
import { estimateFees } from "./estimateFees";
import { getStakes } from "./getStakes";
import { getTokenFromAsset } from "./getTokenFromAsset";
import { getAllValidators } from "./getValidators";
import { hasSpecificIntentData } from "./utils";
import { validateMemo } from "./validateMemo";

type Errors = Record<string, Error>;
type Warnings = Record<string, Error>;
type Intent = TransactionIntent<HederaMemo, HederaTxData>;

function toBigInt(value: BigNumber): bigint {
  return BigInt(value.toFixed(0));
}

function bigIntMax(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

function findBalance(balances: Balance[], asset: Intent["asset"]): Balance | undefined {
  if (asset.type === "native") {
    return balances.find(b => b.asset.type === "native");
  }
  const reference = "assetReference" in asset ? asset.assetReference : undefined;
  return balances.find(b => "assetReference" in b.asset && b.asset.assetReference === reference);
}

// Framework convention: available funds are `value - locked`, never negative.
// Reading this instead of a raw account balance is what makes a pending, not-yet-synced
// spend reduce the available balance (ADR 0004's first deliberate behavior change).
function availableAmount(balance: Balance | undefined): bigint {
  if (!balance) return 0n;
  const available = balance.value - (balance.locked ?? 0n);
  return available > 0n ? available : 0n;
}

async function validateRecipient(
  sender: string,
  recipient: string,
  currencyId: string,
): Promise<Error | null> {
  if (!recipient || recipient.length === 0) {
    return new RecipientRequired();
  }

  const [parsingError, parsingResult] = await safeParseAccountId({
    configOrCurrencyId: currencyId,
    address: recipient,
  });

  if (parsingError) {
    return parsingError;
  }

  if (sender === parsingResult.accountId) {
    return new InvalidAddressBecauseDestinationIsAlsoSource();
  }

  return null;
}

async function validateCoinTransaction(
  intent: Intent,
  balances: Balance[],
  currencyId: string,
): Promise<TransactionValidation> {
  const errors: Errors = {};
  const warnings: Warnings = {};

  const [recipientError, estimatedFees] = await Promise.all([
    validateRecipient(intent.sender, intent.recipient, currencyId),
    estimateFees({ currencyId, operationType: HEDERA_OPERATION_TYPES.CryptoTransfer }),
  ]);

  if (recipientError) {
    errors.recipient = recipientError;
  }

  const fee = toBigInt(estimatedFees.tinybars);
  const available = availableAmount(findBalance(balances, { type: "native" }));
  const amount = intent.useAllAmount ? bigIntMax(available - fee, 0n) : intent.amount;
  const totalSpent = amount + fee;

  if (amount === 0n && !intent.useAllAmount) {
    errors.amount = new AmountRequired();
  }

  if (available < totalSpent) {
    errors.amount = new NotEnoughBalance("");
  }

  if (!validateMemo(intent.memo?.value)) {
    errors.transaction = new HederaMemoExceededSizeError();
  }

  return { errors, warnings, estimatedFees: fee, amount, totalSpent };
}

// Shared tail for the HTS and ERC20 branches: both spend a token balance while paying the
// network fee out of the native balance, and differ only in how `errors`/`warnings` are
// populated (association check vs. EVM-address warning) and in the `estimateFees` call shape.
function finalizeTokenTransfer(
  intent: Intent,
  balances: Balance[],
  fee: bigint,
  errors: Errors,
  warnings: Warnings,
): TransactionValidation {
  const availableToken = availableAmount(findBalance(balances, intent.asset));
  const availableNative = availableAmount(findBalance(balances, { type: "native" }));
  const amount = intent.useAllAmount ? availableToken : intent.amount;
  const totalSpent = amount;

  if (!validateMemo(intent.memo?.value)) {
    errors.transaction = new HederaMemoExceededSizeError();
  }

  if (amount === 0n) {
    errors.amount = new AmountRequired();
  }

  if (availableToken < totalSpent) {
    errors.amount = new NotEnoughBalance();
  }

  if (availableNative < fee) {
    errors.amount = new NotEnoughBalance();
  }

  return { errors, warnings, estimatedFees: fee, amount, totalSpent };
}

async function validateHTSTokenTransaction(
  intent: Intent,
  balances: Balance[],
  currencyId: string,
  token: TokenCurrency,
): Promise<TransactionValidation> {
  const errors: Errors = {};
  const warnings: Warnings = {};

  const [recipientError, estimatedFees, isRecipientAssociated] = await Promise.all([
    validateRecipient(intent.sender, intent.recipient, currencyId),
    estimateFees({ currencyId, operationType: HEDERA_OPERATION_TYPES.TokenTransfer }),
    checkAccountTokenAssociationStatus(intent.recipient, token).catch(() => null),
  ]);

  if (recipientError) {
    errors.recipient = recipientError;
  } else if (isRecipientAssociated === false) {
    warnings.missingAssociation = new HederaRecipientTokenAssociationRequired();
  } else if (isRecipientAssociated === null) {
    warnings.unverifiedAssociation = new HederaRecipientTokenAssociationUnverified();
  }

  const fee = toBigInt(estimatedFees.tinybars);
  return finalizeTokenTransfer(intent, balances, fee, errors, warnings);
}

async function validateERC20TokenTransaction(
  coinConfig: HederaCoinConfig,
  intent: Intent,
  balances: Balance[],
  currencyId: string,
): Promise<TransactionValidation> {
  const errors: Errors = {};
  const warnings: Warnings = {
    unverifiedEvmAddress: new HederaRecipientEvmAddressVerificationRequired(),
  };

  const [recipientError, estimatedFees] = await Promise.all([
    validateRecipient(intent.sender, intent.recipient, currencyId),
    estimateFees({
      configOrCurrencyId: coinConfig,
      operationType: HEDERA_OPERATION_TYPES.ContractCall,
      txIntent: intent,
    }),
  ]);

  if (recipientError) {
    errors.recipient = recipientError;
  }

  const fee = toBigInt(estimatedFees.tinybars);
  return finalizeTokenTransfer(intent, balances, fee, errors, warnings);
}

async function validateTokenAssociateTransaction(
  intent: Intent,
  balances: Balance[],
  currencyId: string,
  token: TokenCurrency,
): Promise<TransactionValidation> {
  const errors: Errors = {};
  const warnings: Warnings = {};
  const currency = findCryptoCurrencyById(currencyId);
  invariant(currency, `hedera: currency with id ${currencyId} not found`);

  const [usdRate, estimatedFees, isAssociationRequired] = await Promise.all([
    getCurrencyToUSDRate(currency),
    estimateFees({ currencyId, operationType: HEDERA_OPERATION_TYPES.TokenAssociate }),
    token.tokenType === "hts"
      ? checkAccountTokenAssociationStatus(intent.sender, token).then(associated => !associated)
      : Promise.resolve(false),
  ]);

  const amount = 0n;
  const fee = toBigInt(estimatedFees.tinybars);
  const totalSpent = amount + fee;

  if (!validateMemo(intent.memo?.value)) {
    errors.transaction = new HederaMemoExceededSizeError();
  }

  if (isAssociationRequired) {
    const availableNative = availableAmount(findBalance(balances, { type: "native" }));
    const hbarBalance = new BigNumber(availableNative.toString()).dividedBy(
      10 ** currency.units[0].magnitude,
    );
    const currentWorthInUSD = usdRate ? hbarBalance.multipliedBy(usdRate) : new BigNumber(0);
    const requiredWorthInUSD = getEnv("HEDERA_TOKEN_ASSOCIATION_MIN_USD");

    if (currentWorthInUSD.isLessThan(requiredWorthInUSD)) {
      errors.insufficientAssociateBalance = new HederaInsufficientFundsForAssociation("", {
        requiredWorthInUSD,
      });
    }
  }

  return { errors, warnings, estimatedFees: fee, amount, totalSpent };
}

function isStakingMode(
  type: string,
): type is
  | HEDERA_TRANSACTION_MODES.Delegate
  | HEDERA_TRANSACTION_MODES.Undelegate
  | HEDERA_TRANSACTION_MODES.Redelegate
  | HEDERA_TRANSACTION_MODES.ClaimRewards {
  return (
    type === HEDERA_TRANSACTION_MODES.Delegate ||
    type === HEDERA_TRANSACTION_MODES.Undelegate ||
    type === HEDERA_TRANSACTION_MODES.Redelegate ||
    type === HEDERA_TRANSACTION_MODES.ClaimRewards
  );
}

async function validateStakingTransaction(
  coinConfig: HederaCoinConfig,
  currencyId: string,
  intent: Intent,
  balances: Balance[],
): Promise<TransactionValidation> {
  const errors: Errors = {};
  const warnings: Warnings = {};

  // craftTransaction.ts builds claim-rewards as a coin transfer (a CryptoTransfer on the
  // network), while every other staking mode builds an AccountUpdateTransaction
  // (CryptoUpdate). Estimate against the operation type that is actually signed, or
  // errors.fee and warnings.claimRewardsFee inflate the claim-rewards fee ~2.2x.
  const operationType =
    intent.type === HEDERA_TRANSACTION_MODES.ClaimRewards
      ? HEDERA_OPERATION_TYPES.CryptoTransfer
      : HEDERA_OPERATION_TYPES.CryptoUpdate;

  const [estimatedFees, currentStakePage, validators] = await Promise.all([
    estimateFees({ currencyId, operationType }),
    getStakes({ configOrCurrencyId: coinConfig, address: intent.sender }),
    getAllValidators({ configOrCurrencyId: coinConfig }),
  ]);

  const currentStake = currentStakePage.items[0];
  const currentNodeId = currentStake?.details?.stakedNodeId ?? null;
  const fee = toBigInt(estimatedFees.tinybars);
  const amount = 0n;
  const totalSpent = amount + fee;

  if (!validateMemo(intent.memo?.value)) {
    errors.transaction = new HederaMemoExceededSizeError();
  }

  if (
    intent.type === HEDERA_TRANSACTION_MODES.Delegate ||
    intent.type === HEDERA_TRANSACTION_MODES.Redelegate
  ) {
    const targetNodeId = hasSpecificIntentData(intent, "staking")
      ? intent.data.stakingNodeId
      : undefined;

    if (typeof targetNodeId === "number") {
      const isValid = validators.some(v => v.nodeId === String(targetNodeId));
      if (!isValid) {
        errors.stakingNodeId = new HederaInvalidStakingNodeIdError();
      }
    } else {
      errors.missingStakingNodeId = new HederaInvalidStakingNodeIdError("Validator must be set");
    }

    // ADR 0004: check before overwriting. The legacy bridge always ran the redundant-node
    // check second and let it clobber `errors.stakingNodeId`, so a node that was both
    // invalid *and* the current delegation lost its invalid-node message. Guarding on
    // `!errors.stakingNodeId` keeps whichever error was set first.
    if (
      !errors.stakingNodeId &&
      typeof targetNodeId === "number" &&
      currentNodeId === targetNodeId
    ) {
      errors.stakingNodeId = new HederaRedundantStakingNodeIdError();
    }
  }

  if (intent.type === HEDERA_TRANSACTION_MODES.ClaimRewards) {
    const rewardsToClaim = currentStake?.amountRewarded ?? 0n;

    if (rewardsToClaim <= 0n) {
      errors.noRewardsToClaim = new HederaNoStakingRewardsError();
    }

    if (fee > rewardsToClaim) {
      warnings.claimRewardsFee = new ClaimRewardsFeesWarning();
    }
  }

  const availableNative = availableAmount(findBalance(balances, { type: "native" }));
  if (availableNative < totalSpent) {
    errors.fee = new NotEnoughBalance("");
  }

  return { errors, warnings, estimatedFees: fee, amount, totalSpent };
}

export async function validateIntent(
  coinConfig: HederaCoinConfig,
  currencyId: string,
  intent: Intent,
  balances: Balance[],
  _customFees?: FeeEstimation,
): Promise<TransactionValidation> {
  if (intent.type === HEDERA_TRANSACTION_MODES.TokenAssociate) {
    const currency = findCryptoCurrencyById(currencyId);
    invariant(currency, `hedera: currency with id ${currencyId} not found`);
    const token = await getTokenFromAsset(currency, intent.asset);
    invariant(token, "hedera: token not found for association intent");
    return validateTokenAssociateTransaction(intent, balances, currencyId, token);
  }

  if (intent.asset.type === "hts") {
    const currency = findCryptoCurrencyById(currencyId);
    invariant(currency, `hedera: currency with id ${currencyId} not found`);
    const token = await getTokenFromAsset(currency, intent.asset);
    invariant(token, "hedera: token not found for transfer intent");
    return validateHTSTokenTransaction(intent, balances, currencyId, token);
  }

  if (intent.asset.type === "erc20") {
    return validateERC20TokenTransaction(coinConfig, intent, balances, currencyId);
  }

  if (isStakingMode(intent.type)) {
    return validateStakingTransaction(coinConfig, currencyId, intent, balances);
  }

  return validateCoinTransaction(intent, balances, currencyId);
}
