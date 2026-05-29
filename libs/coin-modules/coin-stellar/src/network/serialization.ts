/*
 * Serialization functions from Horizon to Ledger Live types
 */
import type { Operation } from "@ledgerhq/coin-module-framework/api/types";
import { Horizon } from "@stellar/stellar-sdk";
import BigNumber from "bignumber.js";
import type { BalanceAsset, RawOperation, StellarMemo } from "../types";
import { parseAPIValue } from "../logic/common";

// Constants
const BASE_RESERVE_MIN_COUNT = 2;
export const BASE_RESERVE = 0.5;
export const MIN_BALANCE = 1;

export function getReservedBalance(account: Horizon.ServerApi.AccountRecord): BigNumber {
  const numOfSponsoringEntries = Number(account.num_sponsoring);
  const numOfSponsoredEntries = Number(account.num_sponsored);

  const nativeAsset = account.balances?.find(b => b.asset_type === "native") as BalanceAsset;

  const amountInOffers = new BigNumber(nativeAsset?.selling_liabilities || 0);
  const numOfEntries = new BigNumber(account.subentry_count || 0);

  return new BigNumber(BASE_RESERVE_MIN_COUNT)
    .plus(numOfEntries)
    .plus(numOfSponsoringEntries)
    .minus(numOfSponsoredEntries)
    .times(BASE_RESERVE)
    .plus(amountInOffers);
}

export async function rawOperationsToOperations(
  operations: RawOperation[],
  addr: string,
  accountId: string,
  minHeight: number,
): Promise<Operation[]> {
  const supportedOperationTypes = [
    "create_account",
    "payment",
    "path_payment_strict_send",
    "path_payment_strict_receive",
    "change_trust",
  ];

  // First pass: per raw op, format it when it passes the address+type filters.
  // Other raw ops produce `undefined`, but their slot is preserved so we can
  // later position fee-only rows at the index of the original raw op.
  const formatted = await Promise.all(
    operations.map(operation => {
      const involvesAddress =
        operation.from === addr ||
        operation.to === addr ||
        operation.funder === addr ||
        operation.account === addr ||
        operation.trustor === addr ||
        operation.source_account === addr;
      if (!involvesAddress) return undefined;
      if (!supportedOperationTypes.includes(operation.type)) return undefined;
      return formatOperation(operation, accountId, addr, minHeight);
    }),
  );

  // Stellar transactions whose fee is already carried by at least one surfaced
  // Operation. We never emit a redundant fee row for these.
  const txHashesAlreadySurfaced = new Set(
    formatted.filter((op): op is Operation => op !== undefined).map(op => op.tx.hash),
  );

  // Second pass: for every Stellar tx the address actually paid the fee on but
  // that produced no surfaced Operation (e.g. `create_claimable_balance`-only,
  // `liquidity_pool_deposit`-only, `set_options`-only, `bump_sequence`-only,
  // ...), emit a single fee-only Operation so its `fee_charged` is not silently
  // dropped from the operations list. We slot it at the position of the first
  // raw op of that tx in the input order to preserve the page's descending order.
  const feeOnlyEmitted = new Set<string>();
  const feeOnly = await Promise.all(
    operations.map(operation => {
      if (txHashesAlreadySurfaced.has(operation.transaction_hash)) return undefined;
      if (feeOnlyEmitted.has(operation.transaction_hash)) return undefined;
      feeOnlyEmitted.add(operation.transaction_hash);
      return formatFeeOnlyOperation(operation, accountId, addr, minHeight);
    }),
  );

  const result: Operation[] = [];
  for (let i = 0; i < operations.length; i++) {
    const feeOp = feeOnly[i];
    if (feeOp) result.push(feeOp);
    const op = formatted[i];
    if (op) result.push(op);
  }
  return result;
}

async function formatOperation(
  rawOperation: RawOperation,
  accountId: string,
  addr: string,
  minHeight: number,
): Promise<Operation | undefined> {
  const transaction = await rawOperation.transaction();

  if (transaction.ledger_attr < minHeight) return undefined;

  const { hash: blockHash, closed_at: blockTime } = await transaction.ledger();
  const type = getOperationType(rawOperation, addr);
  const value = getValue(rawOperation, transaction, type);
  const recipients = getRecipients(rawOperation);
  const memo = decodeMemo(transaction);

  const operation: Operation = {
    id: `${accountId}-${rawOperation.transaction_hash}-${type}`,
    value: rawOperation?.asset_code ? BigInt(transaction.fee_charged) : BigInt(value.toString()),
    // TODO: doc
    // Using type NONE to hide asset operations from the main account (show them
    // only on sub-account)
    type: rawOperation?.asset_code && !["OPT_IN", "OPT_OUT"].includes(type) ? "NONE" : type,
    senders: [rawOperation.source_account],
    recipients,
    tx: {
      hash: rawOperation.transaction_hash,
      block: {
        hash: blockHash,
        time: new Date(blockTime),
        height: transaction.ledger_attr,
      },
      fees: BigInt(transaction.fee_charged),
      date: new Date(rawOperation.created_at),
      failed: !rawOperation.transaction_successful,
      ...(transaction.fee_account ? { feesPayer: transaction.fee_account } : {}),
    },
    asset:
      rawOperation?.asset_code && rawOperation?.asset_issuer
        ? {
            type: "token",
            assetReference: rawOperation.asset_code,
            assetOwner: rawOperation.asset_issuer,
          }
        : { type: "native" },
    details: {
      pagingToken: rawOperation.paging_token,
      assetCode: rawOperation.asset_code,
      assetIssuer: rawOperation.asset_issuer,
      assetAmount: rawOperation.asset_code ? value.toString() : undefined,
      ledgerOpType: type,
      blockTime: new Date(blockTime),
      index: rawOperation.id,
      memo,
      sequence: new BigNumber(transaction.source_account_sequence).isNaN()
        ? undefined
        : new BigNumber(transaction.source_account_sequence).toString(),
    },
  };

  return operation;
}

/**
 * Emit a single fee-only Operation that carries `fee_charged` for a Stellar
 * transaction the address paid for but which produced no other surfaced
 * Operation. The Operation is marked `type: "FEES"` so the downstream
 * generic-coin-framework adapter renders it as a fee entry with
 * `value = 0 + fees` and `fee = fees`, matching the on-chain XLM debit.
 */
async function formatFeeOnlyOperation(
  rawOperation: RawOperation,
  accountId: string,
  addr: string,
  minHeight: number,
): Promise<Operation | undefined> {
  const transaction = await rawOperation.transaction();

  if (transaction.ledger_attr < minHeight) return undefined;

  // For non-fee-bump transactions Horizon sets `fee_account === source_account`;
  // for fee-bump transactions it is the outer fee payer. Only emit a fee row
  // when the address we are listing is the actual payer of the network fee.
  const feePayer = transaction.fee_account ?? transaction.source_account;
  if (feePayer !== addr) return undefined;

  const { hash: blockHash, closed_at: blockTime } = await transaction.ledger();
  const memo = decodeMemo(transaction);

  return {
    id: `${accountId}-${rawOperation.transaction_hash}-FEES`,
    value: 0n,
    type: "FEES",
    senders: [feePayer],
    recipients: [],
    tx: {
      hash: rawOperation.transaction_hash,
      block: {
        hash: blockHash,
        time: new Date(blockTime),
        height: transaction.ledger_attr,
      },
      fees: BigInt(transaction.fee_charged),
      date: new Date(rawOperation.created_at),
      failed: !rawOperation.transaction_successful,
      ...(transaction.fee_account ? { feesPayer: transaction.fee_account } : {}),
    },
    asset: { type: "native" },
    details: {
      pagingToken: rawOperation.paging_token,
      assetCode: undefined,
      assetIssuer: undefined,
      assetAmount: undefined,
      ledgerOpType: "FEES",
      blockTime: new Date(blockTime),
      index: rawOperation.id,
      memo,
      sequence: new BigNumber(transaction.source_account_sequence).isNaN()
        ? undefined
        : new BigNumber(transaction.source_account_sequence).toString(),
    },
  };
}

function decodeMemo(transaction: Horizon.ServerApi.TransactionRecord): StellarMemo | undefined {
  switch (transaction.memo_type) {
    case "none":
      return { type: "NO_MEMO" };
    case "id":
      return transaction.memo ? { type: "MEMO_ID", value: transaction.memo } : undefined;
    case "text":
      return transaction.memo ? { type: "MEMO_TEXT", value: transaction.memo } : undefined;
    case "return":
      return transaction.memo
        ? {
            type: "MEMO_RETURN",
            value: Buffer.from(transaction.memo, "base64").toString("hex"),
          }
        : undefined;
    case "hash":
      return transaction.memo
        ? {
            type: "MEMO_HASH",
            value: Buffer.from(transaction.memo, "base64").toString("hex"),
          }
        : undefined;
    default:
      return undefined;
  }
}

function getRecipients(operation: RawOperation): string[] {
  switch (operation.type) {
    case "create_account":
      return [operation.account];

    case "payment":
      return [operation.to_muxed || operation.to];

    case "path_payment_strict_send":
      return [operation.to];

    default:
      return [];
  }
}

function getValue(
  operation: RawOperation,
  transaction: Horizon.ServerApi.TransactionRecord,
  type: string,
): BigNumber {
  let value = new BigNumber(0);

  if (!operation.transaction_successful) {
    return type === "IN" ? value : new BigNumber(transaction.fee_charged || 0);
  }

  switch (operation.type) {
    case "create_account":
      return parseAPIValue(operation.starting_balance);
    case "payment":
    case "path_payment_strict_send":
    case "path_payment_strict_receive":
      return parseAPIValue(operation.amount);

    default:
      return type !== "IN" ? new BigNumber(transaction.fee_charged) : value;
  }
}

function getOperationType(operation: RawOperation, addr: string): string {
  switch (operation.type) {
    case "create_account":
      return operation.funder === addr ? "OUT" : "IN";

    case "payment":
      if (operation.from === addr && operation.to !== addr) {
        return "OUT";
      }

      return "IN";

    case "path_payment_strict_send":
      if (operation.to === addr) return "IN";
      return "OUT";

    case "path_payment_strict_receive":
      return "IN";

    case "change_trust":
      if (new BigNumber(operation.limit).eq(0)) {
        return "OPT_OUT";
      }

      return "OPT_IN";

    default:
      if (operation.source_account === addr) {
        return "OUT";
      }

      return "IN";
  }
}
