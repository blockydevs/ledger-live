import type { CommonDeviceTransactionField as DeviceTransactionField } from "@ledgerhq/ledger-wallet-framework/transaction/common";
import type { AccountLike, Account } from "@ledgerhq/types-live";
import { HEDERA_TRANSACTION_MODES, MAP_STAKING_MODE_TO_METHOD } from "@ledgerhq/coin-hedera/constants";
import type { Transaction, TransactionStatus } from "./types";

const STAKING_MODES = new Set<string>([
  HEDERA_TRANSACTION_MODES.Delegate,
  HEDERA_TRANSACTION_MODES.Undelegate,
  HEDERA_TRANSACTION_MODES.Redelegate,
  HEDERA_TRANSACTION_MODES.ClaimRewards,
]);

function isStakingTransaction(transaction: Transaction): boolean {
  return typeof transaction.mode === "string" && STAKING_MODES.has(transaction.mode);
}

function isTokenAssociateTransaction(transaction: Transaction): boolean {
  return transaction.mode === HEDERA_TRANSACTION_MODES.TokenAssociate;
}

async function getDeviceTransactionConfig({
  transaction,
  status: { estimatedFees },
}: {
  account: AccountLike;
  parentAccount?: Account | null;
  transaction: Transaction;
  status: TransactionStatus;
}): Promise<Array<DeviceTransactionField>> {
  const fields: Array<DeviceTransactionField> = [];

  if (isStakingTransaction(transaction)) {
    fields.push({
      type: "text",
      label: "Method",
      value: MAP_STAKING_MODE_TO_METHOD[transaction.mode as string],
    });

    if (estimatedFees && !estimatedFees.isZero()) {
      fields.push({
        type: "fees",
        label: "Fees",
      });
    }

    if (transaction.valId) {
      fields.push({
        type: "text",
        label: "Staked Node ID",
        value: transaction.valId,
      });
    }

    if (transaction.memoValue) {
      fields.push({
        type: "text",
        label: "Memo",
        value: transaction.memoValue,
      });
    }

    return fields;
  }

  const method = (() => {
    if (isTokenAssociateTransaction(transaction)) return "Associate Token";
    else if (transaction.useAllAmount) return "Transfer All";
    else return "Transfer";
  })();

  fields.push({
    type: "text",
    label: "Method",
    value: method,
  });

  if (!isTokenAssociateTransaction(transaction)) {
    fields.push({
      type: "amount",
      label: "Amount",
    });
  }

  if (estimatedFees && !estimatedFees.isZero()) {
    fields.push({
      type: "fees",
      label: "Fees",
    });
  }

  if (transaction.mode === HEDERA_TRANSACTION_MODES.Send && transaction.gasLimit) {
    fields.push({
      type: "text",
      label: "Gas Limit",
      value: transaction.gasLimit.toString(),
    });
  }

  if (transaction.memoValue) {
    fields.push({
      type: "text",
      label: "Memo",
      value: transaction.memoValue,
    });
  }

  return fields;
}

export default getDeviceTransactionConfig;
