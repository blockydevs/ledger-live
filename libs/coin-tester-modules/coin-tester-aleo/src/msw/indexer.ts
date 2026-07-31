import type { AleoPublicTransaction } from "@ledgerhq/coin-aleo/types";
import { PROGRAM_ID } from "@ledgerhq/coin-aleo/constants";
import type { DevnodeBlock, DevnodeConfirmedTransaction, DevnodeTransition } from "../devnode";
import { getBlock, getLatestHeight, parseFutureSender } from "../devnode";

/**
 * credits.aleo functions this indexer knows how to flatten. Anything else on
 * credits.aleo is skipped deliberately; a function on this list that cannot be
 * mapped throws instead.
 */
const INDEXED_FUNCTIONS: ReadonlySet<string> = new Set([
  "transfer_public",
  "transfer_public_to_private",
]);

function parseU64(literal: string, field: string): number {
  const match = /^(\d+)u64$/.exec(literal.trim());
  if (!match) {
    throw new Error(`aleo coin-tester: could not read ${field} from '${literal}'`);
  }
  return Number(match[1]);
}

/**
 * The fee lives in its own transition. `fee_public`'s inputs are
 * `[baseFee, priorityFee, executionId]`; `fee_private`'s carry a spent record
 * ahead of those same two, at `[record, baseFee, priorityFee, executionId]`.
 */
export function parseFee(confirmed: DevnodeConfirmedTransaction): number {
  const feeTransition = confirmed.transaction.fee?.transition;
  if (!feeTransition) {
    throw new Error(`aleo coin-tester: transaction ${confirmed.transaction.id} carries no fee`);
  }
  const offset = feeTransition.function === "fee_private" ? 1 : 0;
  const base = feeTransition.inputs[offset];
  const priority = feeTransition.inputs[offset + 1];
  if (!base?.value || !priority?.value) {
    throw new Error(
      `aleo coin-tester: fee transition ${feeTransition.id} does not expose its fee inputs`,
    );
  }
  return parseU64(base.value, "base fee") + parseU64(priority.value, "priority fee");
}

function toRow({
  block,
  confirmed,
  transition,
}: {
  block: DevnodeBlock;
  confirmed: DevnodeConfirmedTransaction;
  transition: DevnodeTransition;
}): AleoPublicTransaction {
  if (confirmed.status !== "accepted") {
    throw new Error(
      `aleo coin-tester: cannot map ${PROGRAM_ID.CREDITS}/${transition.function} with status '${confirmed.status}'`,
    );
  }

  // Both indexed functions take `[recipient, amount]`. transfer_public's recipient
  // is a bare address; transfer_public_to_private's is ciphertext, which the
  // bridge decrypts or matches against the account's own private records.
  const [recipient, amount] = transition.inputs;
  if (!recipient?.value || !amount?.value) {
    throw new Error(
      `aleo coin-tester: transition ${transition.id} does not expose its transfer inputs`,
    );
  }

  return {
    transaction_id: confirmed.transaction.id,
    transition_id: transition.id,
    // Exactly "Accepted": anything else sets hasFailed on the operation.
    transaction_status: "Accepted",
    block_number: block.header.metadata.height,
    block_hash: block.block_hash,
    // Unix seconds as a string; ISO-8601 would give an Invalid Date downstream.
    block_timestamp: String(block.header.metadata.timestamp),
    function_id: transition.function,
    amount: parseU64(amount.value, "amount"),
    sender_address: parseFutureSender(transition),
    recipient_address: recipient.value.trim(),
    program_id: transition.program,
    fee: parseFee(confirmed),
  };
}

/** Scans every block from 0 and flattens the indexed credits.aleo transitions. */
export async function scanIndexedTransfers(): Promise<AleoPublicTransaction[]> {
  const height = await getLatestHeight();
  const rows: AleoPublicTransaction[] = [];

  for (let current = 0; current <= height; current++) {
    const block = await getBlock(current);
    for (const confirmed of block.transactions ?? []) {
      for (const transition of confirmed.transaction.execution?.transitions ?? []) {
        if (transition.program !== PROGRAM_ID.CREDITS) continue;
        if (!INDEXED_FUNCTIONS.has(transition.function)) continue;
        rows.push(toRow({ block, confirmed, transition }));
      }
    }
  }

  return rows;
}

/** Rows touching `address` on either side, oldest first. */
export async function getAccountTransactionRows(address: string): Promise<AleoPublicTransaction[]> {
  const rows = await scanIndexedTransfers();
  return rows
    .filter(row => row.sender_address === address || row.recipient_address === address)
    .sort((a, b) => a.block_number - b.block_number);
}
