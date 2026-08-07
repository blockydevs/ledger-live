import {
  AccountUpdateTransaction,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  ContractId,
  Hbar,
  TokenAssociateTransaction,
  TransactionId,
  TransferTransaction,
} from "@hashgraph/sdk";
import type { FeeEstimation, TransactionIntent } from "@ledgerhq/coin-module-framework/api/index";
import { getEnv } from "@ledgerhq/live-env";
import BigNumber from "bignumber.js";
import invariant from "invariant";
import type { HederaCoinConfig } from "../config";
import {
  DEFAULT_GAS_LIMIT,
  HEDERA_TRANSACTION_MODES,
  MAP_STAKING_MODE_TO_MEMO,
  TRANSACTION_VALID_DURATION_SECONDS,
} from "../constants";
import { rpcClient } from "../network/rpc";
import { createTransactionId, toEVMAddress } from "../network/utils";
import type { HederaMemo, HederaTxData } from "../types";
import { hasSpecificIntentData, resolveConfig, serializeTransaction } from "./utils";

interface BuilderOperator {
  accountId: string;
}

interface BuilderCommonTransactionFields {
  transactionId: TransactionId;
  maxFee: BigNumber | undefined;
  memo: string;
}

interface BuilderCoinTransferTransaction extends BuilderCommonTransactionFields {
  type: HEDERA_TRANSACTION_MODES.Send;
  amount: BigNumber;
  recipient: string;
}

interface BuilderHTSTokenTransferTransaction extends BuilderCommonTransactionFields {
  type: HEDERA_TRANSACTION_MODES.Send;
  tokenAddress: string;
  amount: BigNumber;
  recipient: string;
}

interface BuilderERC20TokenTransferTransaction extends BuilderCommonTransactionFields {
  type: HEDERA_TRANSACTION_MODES.Send;
  tokenAddress: string;
  amount: BigNumber;
  recipient: string;
  gasLimit: BigNumber;
}

interface BuilderTokenAssociateTransaction extends BuilderCommonTransactionFields {
  type: HEDERA_TRANSACTION_MODES.TokenAssociate;
  tokenId: string;
}

interface BuilderUpdateAccountTransaction extends BuilderCommonTransactionFields {
  type:
    | HEDERA_TRANSACTION_MODES.Delegate
    | HEDERA_TRANSACTION_MODES.Undelegate
    | HEDERA_TRANSACTION_MODES.Redelegate;
  stakingNodeId: number | null | undefined;
}

async function buildUnsignedCoinTransaction({
  config,
  account,
  transaction,
}: {
  config: HederaCoinConfig;
  account: BuilderOperator;
  transaction: BuilderCoinTransferTransaction;
}): Promise<TransferTransaction> {
  const accountId = account.accountId;
  const hbarAmount = Hbar.fromTinybars(transaction.amount);

  const tx = new TransferTransaction()
    .setTransactionValidDuration(TRANSACTION_VALID_DURATION_SECONDS)
    .setTransactionId(transaction.transactionId)
    .setTransactionMemo(transaction.memo ?? "")
    .addHbarTransfer(accountId, hbarAmount.negated())
    .addHbarTransfer(transaction.recipient, hbarAmount);

  if (transaction.maxFee) {
    tx.setMaxTransactionFee(Hbar.fromTinybars(transaction.maxFee.toNumber()));
  }

  return tx.freezeWith(await rpcClient.getInstance(config));
}

async function buildUnsignedHTSTokenTransaction({
  config,
  account,
  transaction,
}: {
  config: HederaCoinConfig;
  account: BuilderOperator;
  transaction: BuilderHTSTokenTransferTransaction;
}): Promise<TransferTransaction> {
  const accountId = account.accountId;
  const tokenId = transaction.tokenAddress;

  const tx = new TransferTransaction()
    .setTransactionValidDuration(TRANSACTION_VALID_DURATION_SECONDS)
    .setTransactionId(transaction.transactionId)
    .setTransactionMemo(transaction.memo ?? "")
    .addTokenTransfer(tokenId, accountId, transaction.amount.negated().toNumber())
    .addTokenTransfer(tokenId, transaction.recipient, transaction.amount.toNumber());

  if (transaction.maxFee) {
    tx.setMaxTransactionFee(Hbar.fromTinybars(transaction.maxFee.toNumber()));
  }

  return tx.freezeWith(await rpcClient.getInstance(config));
}

async function buildUnsignedERC20TokenTransaction({
  config,
  transaction,
}: {
  transaction: BuilderERC20TokenTransferTransaction;
  config: HederaCoinConfig;
}): Promise<ContractExecuteTransaction> {
  const contractId = ContractId.fromEvmAddress(0, 0, transaction.tokenAddress);
  const recipientEvmAddress = await toEVMAddress({
    configOrCurrencyId: config,
    accountId: transaction.recipient,
  });
  invariant(recipientEvmAddress, `hedera: EVM address is missing ${transaction.recipient}`);
  const gas = transaction.gasLimit.toNumber();

  // create function parameters for ERC20 transfer function
  // transfer(address to, uint256 amount) returns (bool)
  const functionParameters = new ContractFunctionParameters()
    .addAddress(recipientEvmAddress)
    .addUint256(transaction.amount.toNumber());

  const tx = new ContractExecuteTransaction()
    .setTransactionValidDuration(TRANSACTION_VALID_DURATION_SECONDS)
    .setTransactionId(transaction.transactionId)
    .setTransactionMemo(transaction.memo ?? "")
    .setContractId(contractId)
    .setGas(gas)
    .setFunction("transfer", functionParameters);

  if (transaction.maxFee && transaction.maxFee.gt(0)) {
    tx.setMaxTransactionFee(Hbar.fromTinybars(transaction.maxFee.toNumber()));
  }

  return tx.freezeWith(await rpcClient.getInstance(config));
}

async function buildTokenAssociateTransaction({
  config,
  account,
  transaction,
}: {
  config: HederaCoinConfig;
  account: BuilderOperator;
  transaction: BuilderTokenAssociateTransaction;
}): Promise<TokenAssociateTransaction> {
  const accountId = account.accountId;

  const tx = new TokenAssociateTransaction()
    .setTransactionValidDuration(TRANSACTION_VALID_DURATION_SECONDS)
    .setTransactionId(transaction.transactionId)
    .setTransactionMemo(transaction.memo ?? "")
    .setAccountId(accountId)
    .setTokenIds([transaction.tokenId]);

  if (transaction.maxFee) {
    tx.setMaxTransactionFee(Hbar.fromTinybars(transaction.maxFee.toNumber()));
  }

  return tx.freezeWith(await rpcClient.getInstance(config));
}

async function buildUnsignedUpdateAccountTransaction({
  config,
  account,
  transaction,
}: {
  config: HederaCoinConfig;
  account: BuilderOperator;
  transaction: BuilderUpdateAccountTransaction;
}): Promise<AccountUpdateTransaction> {
  const accountId = account.accountId;

  const tx = new AccountUpdateTransaction()
    .setTransactionValidDuration(TRANSACTION_VALID_DURATION_SECONDS)
    .setTransactionId(transaction.transactionId)
    .setTransactionMemo(transaction.memo ?? "")
    .setAccountId(accountId);

  if (transaction.maxFee) {
    tx.setMaxTransactionFee(Hbar.fromTinybars(transaction.maxFee.toNumber()));
  }

  if (typeof transaction.stakingNodeId === "number") {
    tx.setStakedNodeId(transaction.stakingNodeId);
  }

  if (transaction.stakingNodeId === null) {
    tx.clearStakedNodeId();
  }

  return tx.freezeWith(await rpcClient.getInstance(config));
}

function isStakingMode(type: string): type is BuilderUpdateAccountTransaction["type"] {
  return (
    type === HEDERA_TRANSACTION_MODES.Redelegate ||
    type === HEDERA_TRANSACTION_MODES.Undelegate ||
    type === HEDERA_TRANSACTION_MODES.Delegate
  );
}

export async function craftTransaction({
  txIntent,
  customFees,
  configOrCurrencyId,
}: {
  txIntent: TransactionIntent<HederaMemo, HederaTxData>;
  customFees?: FeeEstimation;
  configOrCurrencyId: HederaCoinConfig | string;
}) {
  const account = { accountId: txIntent.sender };
  const maxFee = customFees ? new BigNumber(customFees.value.toString()) : undefined;
  const config = resolveConfig(configOrCurrencyId);
  const transactionId = await createTransactionId(account.accountId, config);

  let tx;

  if (txIntent.type === HEDERA_TRANSACTION_MODES.TokenAssociate) {
    invariant(txIntent.asset.type !== "native", "hedera: invalid asset type");
    invariant("assetReference" in txIntent.asset, "hedera: assetReference is missing");

    tx = await buildTokenAssociateTransaction({
      config,
      account,
      transaction: {
        type: txIntent.type,
        transactionId,
        tokenId: txIntent.asset.assetReference,
        memo: txIntent.memo.value,
        maxFee,
      },
    });
  } else if (txIntent.type === HEDERA_TRANSACTION_MODES.Send && txIntent.asset.type === "hts") {
    invariant("assetReference" in txIntent.asset, "hedera: no assetReference in token transfer");

    const amount = new BigNumber(txIntent.amount.toString());

    tx = await buildUnsignedHTSTokenTransaction({
      config,
      account,
      transaction: {
        type: txIntent.type,
        transactionId,
        tokenAddress: txIntent.asset.assetReference,
        amount,
        recipient: txIntent.recipient,
        memo: txIntent.memo.value,
        maxFee,
      },
    });
  } else if (txIntent.type === HEDERA_TRANSACTION_MODES.Send && txIntent.asset.type === "erc20") {
    invariant("assetReference" in txIntent.asset, "hedera: no assetReference in token transfer");

    const amount = new BigNumber(txIntent.amount.toString());
    // Legacy `signOperation` has no `customFees` channel for gas: it packs the estimate into
    // `txIntent.data.gasLimit` instead, so that's the fallback when `customFees` carries none.
    // Removal trigger: when `coin-hedera/src/bridge/` goes away, drop the `legacyGasLimit`
    // branch and make the erc20 intent's `gasLimit` non-optional.
    const legacyGasLimit = hasSpecificIntentData(txIntent, "erc20")
      ? txIntent.data.gasLimit
      : undefined;
    const estimatedGasLimit =
      (customFees?.parameters?.gasLimit as bigint | number | string | undefined) ?? legacyGasLimit;
    const gasLimit =
      estimatedGasLimit !== undefined
        ? new BigNumber(estimatedGasLimit.toString())
        : DEFAULT_GAS_LIMIT;

    tx = await buildUnsignedERC20TokenTransaction({
      config,
      transaction: {
        type: txIntent.type,
        transactionId,
        tokenAddress: txIntent.asset.assetReference,
        amount,
        recipient: txIntent.recipient,
        memo: txIntent.memo.value,
        maxFee,
        gasLimit,
      },
    });
  } else if (isStakingMode(txIntent.type)) {
    const stakingNodeId = hasSpecificIntentData(txIntent, "staking")
      ? txIntent.data.stakingNodeId
      : undefined;

    tx = await buildUnsignedUpdateAccountTransaction({
      config,
      account,
      transaction: {
        type: txIntent.type,
        transactionId,
        memo: MAP_STAKING_MODE_TO_MEMO[txIntent.type],
        maxFee,
        stakingNodeId,
      },
    });
  }
  // HEDERA_TRANSACTION_MODES.ClaimRewards is just a coin transfer that triggers staking rewards claim.
  // The generic framework's intent carries no UI-supplied recipient/amount for this mode (the UI only
  // sets `mode`), so both are hardcoded here exactly as the legacy bridge's prepareTransaction did:
  // send 1 tinybar to the configured staking-rewards account to trigger the claim.
  else if (txIntent.type === HEDERA_TRANSACTION_MODES.ClaimRewards) {
    const amount = new BigNumber(1);
    const recipient = getEnv("HEDERA_CLAIM_REWARDS_RECIPIENT_ACCOUNT_ID");

    tx = await buildUnsignedCoinTransaction({
      config,
      account,
      transaction: {
        type: HEDERA_TRANSACTION_MODES.Send,
        transactionId,
        amount,
        recipient,
        memo: MAP_STAKING_MODE_TO_MEMO[HEDERA_TRANSACTION_MODES.ClaimRewards],
        maxFee,
      },
    });
  }
  // Plain native HBAR transfer.
  else {
    const amount = new BigNumber(txIntent.amount.toString());

    tx = await buildUnsignedCoinTransaction({
      config,
      account,
      transaction: {
        type: HEDERA_TRANSACTION_MODES.Send,
        transactionId,
        amount,
        recipient: txIntent.recipient,
        memo: txIntent.memo.value,
        maxFee,
      },
    });
  }

  const serializedTx = serializeTransaction(tx);

  return { tx, serializedTx };
}
