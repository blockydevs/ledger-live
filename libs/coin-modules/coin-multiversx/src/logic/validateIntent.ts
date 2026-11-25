import type {
  Balance,
  FeeEstimation,
  StakingTransactionIntent,
  TransactionIntent,
  TransactionValidation,
} from "@ledgerhq/coin-module-framework/api/index";
import { formatCurrencyUnit } from "@ledgerhq/coin-module-framework/currencies";
import {
  AmountRequired,
  FeeTooHigh,
  InvalidAddress,
  InvalidAddressBecauseDestinationIsAlsoSource,
  NotEnoughBalance,
  RecipientRequired,
} from "@ledgerhq/ledger-wallet-framework/errors";
import { isValidAddress } from "./validateAddress";
import { estimateFees, getCustomGasLimit } from "./transaction/estimateFees";
import { getMoveBalanceGas } from "./transaction/computeFee";
import { buildTransactionPayload } from "./transaction/craftTransaction";
import {
  MultiversXDelegationBelowMinimumError,
  MultiversXGasLimitTooLow,
  MultiversXMinDelegatedAmountError,
  MultiversXMinUndelegatedAmountError,
  NotEnoughEGLDForFees,
} from "../errors";
import { MIN_DELEGATION_AMOUNT } from "../constants";

/**
 * The amount staked with `contract`, the figure the legacy rule reads off
 * `multiversxResources.delegations[].userActiveStake`. `validateIntent` gets no account, so the
 * caller looks it up (`api/index.ts` derives it from `getStakes`).
 */
export type GetActiveStake = (address: string, contract: string) => Promise<bigint | undefined>;

const EGLD_UNIT = { name: "EGLD", code: "EGLD", magnitude: 18 };
const MIN_DELEGATION = BigInt(MIN_DELEGATION_AMOUNT.toFixed(0));
const FORMATTED_MIN_DELEGATION = formatCurrencyUnit(EGLD_UNIT, MIN_DELEGATION_AMOUNT, {
  showCode: true,
});

const STAKING_TYPES = new Set([
  "delegate",
  "reDelegateRewards",
  "unDelegate",
  "claimRewards",
  "withdraw",
  "stake.createAccount",
  "stake.undelegate",
  "stake.withdraw",
]);

// The legacy bridge lets these modes carry a zero amount.
const ZERO_AMOUNT_TYPES = new Set([
  "unDelegate",
  "stake.undelegate",
  "withdraw",
  "stake.withdraw",
  "reDelegateRewards",
  "claimRewards",
]);

function findNativeBalance(balances: Balance[]): bigint {
  const b = balances.find(b => b.asset.type === "native");
  return b ? b.value - (b.locked ?? 0n) : 0n;
}

function findEsdtBalance(balances: Balance[], assetReference: string): bigint {
  const b = balances.find(
    b =>
      b.asset.type === "esdt" &&
      "assetReference" in b.asset &&
      b.asset.assetReference === assetReference,
  );
  return b ? b.value : 0n;
}

function getEsdtReference(
  intent: TransactionIntent | StakingTransactionIntent,
): string | undefined {
  const asset = intent.asset;
  if (asset.type === "esdt" && "assetReference" in asset && asset.assetReference) {
    return asset.assetReference;
  }
  return undefined;
}

/** Recipient rule — not required for claimRewards/reDelegateRewards/withdraw. */
function validateRecipient(
  intent: TransactionIntent | StakingTransactionIntent,
  txType: string,
  assetType: string,
  isStaking: boolean,
): Error | undefined {
  const recipientRequired =
    txType !== "claimRewards" &&
    txType !== "reDelegateRewards" &&
    txType !== "withdraw" &&
    txType !== "stake.withdraw";
  if (!recipientRequired) return undefined;

  if (!intent.recipient) return new RecipientRequired();
  if (intent.sender === intent.recipient && assetType === "native" && !isStaking) {
    return new InvalidAddressBecauseDestinationIsAlsoSource();
  }
  if (!isValidAddress(intent.recipient)) {
    return new InvalidAddress("", { currencyName: "MultiversX" });
  }
  return undefined;
}

/**
 * Validates a MultiversX transaction intent with the rules, error types and error keys of the legacy
 * `getTransactionStatus`: the desktop staking flows enable their continue button on the error count
 * and render the `amount` key, so a rule missing here lets a doomed transaction through silently.
 *
 * Two legacy rules have no counterpart: `FeeNotLoaded` (the fee is always estimated here) and
 * `MultiversXDecimalsLimitReached`, which tests the decimals of a fee in base units — an integer —
 * and so never fires.
 */
export async function validateIntent(
  intent: TransactionIntent | StakingTransactionIntent,
  balances: Balance[],
  customFees?: FeeEstimation,
  getActiveStake?: GetActiveStake,
): Promise<TransactionValidation> {
  const errors: Record<string, Error> = {};
  const warnings: Record<string, Error> = {};

  const txType = (intent as StakingTransactionIntent).type ?? "";
  const assetType = intent.asset.type;
  const isStaking = STAKING_TYPES.has(txType);
  const isDelegate = txType === "delegate" || txType === "stake.createAccount";
  const isUndelegate = txType === "unDelegate" || txType === "stake.undelegate";

  // The network rejects a transaction whose gas limit does not cover its move-balance cost.
  const customGasLimit = getCustomGasLimit(customFees?.parameters);
  const gasLimitTooLow =
    customGasLimit !== undefined &&
    customGasLimit < getMoveBalanceGas(buildTransactionPayload(intent).data);
  if (gasLimitTooLow) errors.gasLimit = new MultiversXGasLimitTooLow();

  // The balance checks (and native send-max below) need a real fee, not 0.
  const providedFees = customFees?.value;
  const estimatedFees =
    providedFees !== undefined && providedFees > 0n
      ? providedFees
      : (await estimateFees(intent, gasLimitTooLow ? undefined : customFees?.parameters)).value;

  const recipientError = validateRecipient(intent, txType, assetType, isStaking);
  if (recipientError) errors.recipient = recipientError;

  const nativeSpendable = findNativeBalance(balances);
  const esdtReference = getEsdtReference(intent);
  const useAllAmount = (intent as TransactionIntent).useAllAmount === true;

  // Send-max resolves to the full token balance (ESDT) or the native spendable minus fees; the
  // resolved amount is returned so callers craft with it.
  let amount = intent.amount;
  if (useAllAmount && esdtReference) {
    amount = findEsdtBalance(balances, esdtReference);
  } else if (useAllAmount && assetType === "native" && !isStaking) {
    amount = nativeSpendable > estimatedFees ? nativeSpendable - estimatedFees : 0n;
  }

  if (amount <= 0n && !useAllAmount && !ZERO_AMOUNT_TYPES.has(txType)) {
    errors.amount = new AmountRequired();
  }

  let totalSpent: bigint;
  if (esdtReference) {
    totalSpent = estimatedFees;
    if (!errors.amount && amount > findEsdtBalance(balances, esdtReference)) {
      errors.amount = new NotEnoughBalance();
    }
  } else {
    const consumesNativeAmount = (assetType === "native" && !isStaking) || isDelegate;
    totalSpent = consumesNativeAmount ? amount + estimatedFees : estimatedFees;

    if (!isStaking && amount / 10n < estimatedFees) {
      warnings.feeTooHigh = new FeeTooHigh();
    }

    if (!errors.amount && amount < MIN_DELEGATION) {
      if (isDelegate) {
        errors.amount = new MultiversXMinDelegatedAmountError("", {
          formattedAmount: FORMATTED_MIN_DELEGATION,
        });
      } else if (isUndelegate) {
        errors.amount = new MultiversXMinUndelegatedAmountError("", {
          formattedAmount: FORMATTED_MIN_DELEGATION,
        });
      }
    }

    // Unless the whole delegation is undelegated, what remains must stay at the minimum.
    if (!errors.amount && isUndelegate && intent.recipient && getActiveStake) {
      const activeStake = (await getActiveStake(intent.sender, intent.recipient)) ?? 0n;
      const remaining = activeStake - amount;
      if (remaining > 0n && remaining < MIN_DELEGATION) {
        errors.amount = new MultiversXDelegationBelowMinimumError("", {
          formattedAmount: FORMATTED_MIN_DELEGATION,
        });
      }
    }
  }

  // The fee shortfall goes on `amount`, the key the desktop flows render.
  const spentNative = esdtReference ? estimatedFees : totalSpent;
  if (!errors.amount && spentNative > nativeSpendable) {
    errors.amount =
      esdtReference || (isStaking && !isDelegate)
        ? new NotEnoughEGLDForFees()
        : new NotEnoughBalance();
  }

  return { errors, warnings, estimatedFees, amount, totalSpent };
}
