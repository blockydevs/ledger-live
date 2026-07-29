import type { AleoPublicTransaction } from "@ledgerhq/coin-aleo/types";
import type { DevnodeBlock, DevnodeConfirmedTransaction, DevnodeTransition } from "../devnode";
import { getBlock, getLatestHeight } from "../devnode";

const CREDITS_PROGRAM = "credits.aleo";

/**
 * credits.aleo functions this indexer knows how to flatten. Anything else on
 * credits.aleo is skipped deliberately; a function on this list that cannot be
 * mapped throws instead.
 */
const INDEXED_FUNCTIONS: ReadonlySet<string> = new Set(["transfer_public"]);

function parseU64(literal: string, field: string): number {
  const match = /^(\d+)u64$/.exec(literal.trim());
  if (!match) {
    throw new Error(`aleo coin-tester: could not read ${field} from '${literal}'`);
  }
  return Number(match[1]);
}

/**
 * Reads the sender out of the `future` output.
 *
 * transfer_public's inputs are (recipient, amount) — the sender is `self.signer`
 * and only surfaces in the future's argument list, as text.
 */
function parseSender(transition: DevnodeTransition): string {
  const future = transition.outputs.find(output => output.type === "future");
  if (!future?.value) {
    throw new Error(
      `aleo coin-tester: transition ${transition.id} has no future output to read the sender from`,
    );
  }
  const match = /arguments:\s*\[\s*([^,\]\s]+)/.exec(future.value);
  const sender = match?.[1];
  if (!sender?.startsWith("aleo1")) {
    throw new Error(
      `aleo coin-tester: could not read the sender address from the future of ${transition.id}`,
    );
  }
  return sender;
}

/** The fee lives in its own transition, whose first two inputs are base and priority. */
function parseFee(confirmed: DevnodeConfirmedTransaction): number {
  const feeTransition = confirmed.transaction.fee?.transition;
  if (!feeTransition) {
    throw new Error(`aleo coin-tester: transaction ${confirmed.transaction.id} carries no fee`);
  }
  const [base, priority] = feeTransition.inputs;
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
      `aleo coin-tester: cannot map ${CREDITS_PROGRAM}/${transition.function} with status '${confirmed.status}'`,
    );
  }

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
    sender_address: parseSender(transition),
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
        if (transition.program !== CREDITS_PROGRAM) continue;
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
