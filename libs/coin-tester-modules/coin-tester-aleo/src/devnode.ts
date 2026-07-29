import { ALEO_LOCAL_NODE, ALEO_NETWORK_TYPE } from "./fixtures";

const BASE = `${ALEO_LOCAL_NODE}/${ALEO_NETWORK_TYPE}`;

export type DevnodeTransitionValue = {
  type: "public" | "private" | "future" | "record" | "constant" | "external_record";
  id: string;
  value?: string;
  tag?: string;
};

export type DevnodeTransition = {
  id: string;
  program: string;
  function: string;
  inputs: DevnodeTransitionValue[];
  outputs: DevnodeTransitionValue[];
  tpk: string;
  tcm: string;
  scm: string;
};

export type DevnodeTransaction = {
  type: string;
  id: string;
  execution?: {
    transitions: DevnodeTransition[];
    global_state_root: string;
    proof?: string;
  };
  fee?: {
    transition: DevnodeTransition;
    global_state_root?: string;
    proof?: string;
  };
};

export type DevnodeConfirmedTransaction = {
  status: string;
  type: string;
  index?: number;
  transaction: DevnodeTransaction;
};

export type DevnodeBlock = {
  block_hash: string;
  previous_hash: string;
  header: {
    metadata: {
      height: number;
      timestamp: number;
    };
  };
  transactions: DevnodeConfirmedTransaction[];
};

async function get(path: string): Promise<Response> {
  const response = await fetch(`${BASE}/${path}`);
  if (!response.ok) {
    throw new Error(`aleo coin-tester: GET ${path} failed with HTTP ${response.status}`);
  }
  return response;
}

export async function getLatestHeight(): Promise<number> {
  return Number(await (await get("block/height/latest")).text());
}

export async function getBlock(height: number): Promise<DevnodeBlock> {
  return (await (await get(`block/${height}`)).json()) as DevnodeBlock;
}

export async function getProgramSource(programId: string): Promise<string> {
  // The route answers with a JSON string, not a bare body.
  return (await (await get(`program/${programId}`)).json()) as string;
}

export async function getTransaction(id: string): Promise<DevnodeTransaction> {
  return (await (await get(`transaction/${id}`)).json()) as DevnodeTransaction;
}

/** `null` when the key is absent; the hit is a quoted snarkVM literal. */
export async function getMapping(
  programId: string,
  mapping: string,
  key: string,
): Promise<string | null> {
  return (await (await get(`program/${programId}/mapping/${mapping}/${key}`)).json()) as
    | string
    | null;
}

/**
 * The broadcast route wants a complete transaction JSON — it rejects a body
 * without an `id` field — so callers pass `transaction.toString()` straight
 * through.
 */
export async function broadcastTransaction(transactionJson: string): Promise<void> {
  const response = await fetch(`${BASE}/transaction/broadcast`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: transactionJson,
  });
  if (!response.ok) {
    throw new Error(
      `aleo coin-tester: devnode rejected the transaction: HTTP ${response.status} ${await response.text()}`,
    );
  }
}
