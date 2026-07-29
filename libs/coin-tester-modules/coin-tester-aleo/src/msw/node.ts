import type {
  AleoLatestBlockResponse,
  AleoPublicTransactionDetailsResponse,
  AleoTransition,
} from "@ledgerhq/coin-aleo/types";
import type { DevnodeTransition } from "../devnode";
import { getBlock, getLatestHeight, getMapping } from "../devnode";
import { scanIndexedTransfers } from "./indexer";

const CREDITS_PROGRAM = "credits.aleo";

export async function fetchLatestBlockV2(): Promise<AleoLatestBlockResponse> {
  const block = await getBlock(await getLatestHeight());
  return {
    block_hash: block.block_hash,
    previous_hash: block.previous_hash,
    header: { metadata: block.header.metadata },
  };
}

export function fetchAccountBalanceV2(address: string): Promise<string | null> {
  return getMapping(CREDITS_PROGRAM, "account", address);
}

function toApiTransition(transition: DevnodeTransition): AleoTransition {
  return {
    id: transition.id,
    scm: transition.scm,
    tcm: transition.tcm,
    tpk: transition.tpk,
    // The devnode value type has optional `value`/`tag`; the API type is a union
    // discriminated on `type`. The shapes agree at runtime, but not structurally.
    inputs: transition.inputs as unknown as AleoTransition["inputs"],
    outputs: transition.outputs as unknown as AleoTransition["outputs"],
    program: transition.program,
    function: transition.function,
  };
}

/**
 * Devnode's `transaction/{id}` carries no block or fee-total fields, so the
 * block-level ones come from the same scan the indexer runs.
 */
export async function fetchTransactionV2(
  id: string,
): Promise<AleoPublicTransactionDetailsResponse> {
  const row = (await scanIndexedTransfers()).find(candidate => candidate.transaction_id === id);
  if (!row) {
    throw new Error(`aleo coin-tester: no indexed transaction ${id}`);
  }

  const block = await getBlock(row.block_number);
  const confirmed = (block.transactions ?? []).find(candidate => candidate.transaction.id === id);
  const execution = confirmed?.transaction.execution;
  const feeTransition = confirmed?.transaction.fee?.transition;
  if (!confirmed || !execution || !feeTransition) {
    throw new Error(`aleo coin-tester: transaction ${id} is not a confirmed execution with a fee`);
  }

  return {
    type: confirmed.transaction.type,
    id,
    execution: { transitions: execution.transitions.map(toApiTransition) },
    global_state_root: execution.global_state_root,
    proof: execution.proof ?? "",
    fee: { transition: toApiTransition(feeTransition) },
    fee_value: row.fee,
    block_height: row.block_number,
    block_hash: row.block_hash,
    block_timestamp: row.block_timestamp,
    status: row.transaction_status,
  };
}
