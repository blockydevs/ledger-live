import { executeScenario } from "@ledgerhq/coin-tester/main";
import { getBlockHeight, killStack, spawnStack, advanceBlocks } from "./stack";
import { scenarioTransferPublic } from "./scenarii/transferPublic";
import { assertGenesisAccountIsFunded, getPublicBalance, PROBE_ADDRESS } from "./fixtures";
import { buildMockAleoSigner } from "./signer";
import {
  getProgramSource,
  getLatestHeight,
  getBlock,
  broadcastTransaction,
  getTransaction,
} from "./devnode";
import { loadAleoWasm } from "./wasm";
import {
  ALEO_LOCAL_NODE,
  ALEO_LOCAL_SDK,
  GENESIS_ACCOUNT,
  RECIPIENT_ACCOUNT,
  TRANSFER_AMOUNT_MICROCREDITS,
  TRANSFER_PUBLIC_BASE_FEE,
} from "./fixtures";
import { buildTransaction, handleProve, verifyAuthorizations } from "./msw/prove";
import { getAccountTransactionRows, scanIndexedTransfers } from "./msw/indexer";
import { fetchAccountBalanceV2, fetchLatestBlockV2, fetchTransactionV2 } from "./msw/node";

// Both describes below run against the same stack, so it is brought up once
// for the whole file rather than once per describe.
beforeAll(async () => {
  await spawnStack();
});

afterAll(async () => {
  await killStack();
});

describe("Aleo devnode", () => {
  it("serves a ledger", async () => {
    const height = await getBlockHeight();
    expect(height).toBeGreaterThanOrEqual(1);
  });

  it("starts with a funded genesis account", async () => {
    await expect(assertGenesisAccountIsFunded()).resolves.toBeUndefined();
  });
});

describe("Aleo SDK backend", () => {
  it("answers a health check", async () => {
    const response = await fetch("http://127.0.0.1:3031/_health");
    expect(response.status).toBe(200);
  });
});

async function postSdk<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${ALEO_LOCAL_SDK}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`POST ${path} failed: HTTP ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as T;
}

type PreparedRequest = {
  is_root: boolean;
  network_id: number;
  program_id: string;
  function_name: string;
  inputs: string[];
  input_types: string[];
  nested_calls?: PreparedRequest[];
  record_commitments?: string[];
  tlv: string;
};

describe("mock signer TLV round trip", () => {
  const signer = buildMockAleoSigner(GENESIS_ACCOUNT.privateKey);

  it("derives the genesis address and view key from the pinned private key", async () => {
    await expect(signer.getAddress("")).resolves.toStrictEqual({
      address: GENESIS_ACCOUNT.address,
    });
    await expect(signer.getViewKey("")).resolves.toStrictEqual({
      viewKey: GENESIS_ACCOUNT.viewKey,
    });
  });

  it("signs a transfer_public root intent the backend accepts", async () => {
    const request = await postSdk<PreparedRequest>("/transactions/request", {
      intent: {
        type: "transfer_public",
        amount: String(TRANSFER_AMOUNT_MICROCREDITS),
        to: RECIPIENT_ACCOUNT.address,
      },
      fee: {
        function_name: "fee_public",
        max_base_fee: String(TRANSFER_PUBLIC_BASE_FEE),
        max_priority_fee: "0",
      },
      view_key: GENESIS_ACCOUNT.viewKey,
    });

    const { signature } = await signer.signRootIntent("", Buffer.from(request.tlv, "hex"));

    const authorization = await postSdk<{ authorization: unknown; execution_id: string }>(
      "/transactions/authorization",
      { request, signatures: [signature], view_key: GENESIS_ACCOUNT.viewKey },
    );

    expect(typeof authorization.execution_id).toBe("string");
    expect(authorization.execution_id.length).toBeGreaterThan(0);
    expect(authorization.authorization).toBeTruthy();
  });

  it("signs a fee_public intent the backend accepts", async () => {
    const root = await postSdk<PreparedRequest>("/transactions/request", {
      intent: {
        type: "transfer_public",
        amount: String(TRANSFER_AMOUNT_MICROCREDITS),
        to: RECIPIENT_ACCOUNT.address,
      },
      fee: {
        function_name: "fee_public",
        max_base_fee: String(TRANSFER_PUBLIC_BASE_FEE),
        max_priority_fee: "0",
      },
      view_key: GENESIS_ACCOUNT.viewKey,
    });
    const { signature: rootSignature } = await signer.signRootIntent(
      "",
      Buffer.from(root.tlv, "hex"),
    );
    const rootAuthorization = await postSdk<{ execution_id: string }>(
      "/transactions/authorization",
      { request: root, signatures: [rootSignature], view_key: GENESIS_ACCOUNT.viewKey },
    );

    const feeRequest = await postSdk<PreparedRequest>("/transactions/request", {
      intent: {
        type: "fee_public",
        base_fee: String(TRANSFER_PUBLIC_BASE_FEE),
        priority_fee: "0",
        execution_id: rootAuthorization.execution_id,
      },
      fee: null,
      view_key: GENESIS_ACCOUNT.viewKey,
    });

    const { signature } = await signer.signFeeIntent(Buffer.from(feeRequest.tlv, "hex"));
    const feeAuthorization = await postSdk<{ authorization: unknown }>(
      "/transactions/authorization",
      { request: feeRequest, signatures: [signature], view_key: GENESIS_ACCOUNT.viewKey },
    );

    expect(feeAuthorization.authorization).toBeTruthy();
  });

  it("refuses the paths that public transfers never take", async () => {
    await expect(signer.getTvk("")).rejects.toThrow(/not implemented for public transfers/);
    await expect(signer.signNestedCall(Buffer.alloc(0))).rejects.toThrow(
      /not implemented for public transfers/,
    );
  });
});

describe("devnode execution without a proof", () => {
  it("serves the credits.aleo source", async () => {
    const source = await getProgramSource("credits.aleo");
    expect(source).toContain("program credits.aleo");
    expect(source).toContain("transfer_public");
  });

  it("broadcasts a proofless transfer_public and moves the balance", async () => {
    const wasm = await loadAleoWasm();
    const amount = 2_000_000;
    const before = await getPublicBalance(PROBE_ADDRESS);

    // ProgramManager.buildDevnodeExecutionTransaction is the SDK's async instance
    // method (one options object, needs a live networkClient). The positional,
    // no-instance form used here is ProgramManagerBase — the underlying wasm
    // class the SDK re-exports under that name — whose static method matches
    // this exact argument list.
    const transaction = await wasm.ProgramManagerBase.buildDevnodeExecutionTransaction(
      wasm.PrivateKey.from_string(GENESIS_ACCOUNT.privateKey),
      await getProgramSource("credits.aleo"),
      "transfer_public",
      [PROBE_ADDRESS, `${amount}u64`],
      0,
      undefined,
      // The wasm client appends its own `/${network}/...` segment to this host,
      // so passing the network-qualified base (as devnode.ts's REST client
      // does) would double it into `/testnet/testnet/...` and 404.
      ALEO_LOCAL_NODE,
    );

    await broadcastTransaction(transaction.toString());
    await advanceBlocks(1);

    expect(await getPublicBalance(PROBE_ADDRESS)).toBe(before + BigInt(amount));

    const height = await getLatestHeight();
    const block = await getBlock(height);
    expect(block.header.metadata.height).toBe(height);
    expect(typeof block.header.metadata.timestamp).toBe("number");
  });
});

/** Signs both authorizations exactly the way signOperation does. */
async function buildAuthorizations(recipient: string, amount: number) {
  const signer = buildMockAleoSigner(GENESIS_ACCOUNT.privateKey);

  const rootRequest = await postSdk<PreparedRequest>("/transactions/request", {
    intent: { type: "transfer_public", amount: String(amount), to: recipient },
    fee: {
      function_name: "fee_public",
      max_base_fee: String(TRANSFER_PUBLIC_BASE_FEE),
      max_priority_fee: "0",
    },
    view_key: GENESIS_ACCOUNT.viewKey,
  });
  const { signature: rootSignature } = await signer.signRootIntent(
    "",
    Buffer.from(rootRequest.tlv, "hex"),
  );
  const root = await postSdk<{ authorization: Record<string, unknown>; execution_id: string }>(
    "/transactions/authorization",
    { request: rootRequest, signatures: [rootSignature], view_key: GENESIS_ACCOUNT.viewKey },
  );

  const feeRequest = await postSdk<PreparedRequest>("/transactions/request", {
    intent: {
      type: "fee_public",
      base_fee: String(TRANSFER_PUBLIC_BASE_FEE),
      priority_fee: "0",
      execution_id: root.execution_id,
    },
    fee: null,
    view_key: GENESIS_ACCOUNT.viewKey,
  });
  const { signature: feeSignature } = await signer.signFeeIntent(
    Buffer.from(feeRequest.tlv, "hex"),
  );
  const fee = await postSdk<{ authorization: Record<string, unknown> }>(
    "/transactions/authorization",
    { request: feeRequest, signatures: [feeSignature], view_key: GENESIS_ACCOUNT.viewKey },
  );

  return {
    authorization: root.authorization,
    fee_authorization: fee.authorization,
    broadcast: true,
  };
}

describe("prove handler", () => {
  const amount = 3_000_000;

  it("verifies both authorizations against the expected transfer and fee", async () => {
    const body = await buildAuthorizations(PROBE_ADDRESS, amount);
    await expect(
      verifyAuthorizations(body, { recipient: PROBE_ADDRESS, amount }),
    ).resolves.toBeUndefined();
  });

  it("rejects a swapped recipient", async () => {
    const body = await buildAuthorizations(PROBE_ADDRESS, amount);
    await expect(
      verifyAuthorizations(body, { recipient: RECIPIENT_ACCOUNT.address, amount }),
    ).rejects.toThrow(/recipient/i);
  });

  it("rejects a swapped amount", async () => {
    const body = await buildAuthorizations(PROBE_ADDRESS, amount);
    await expect(
      verifyAuthorizations(body, { recipient: PROBE_ADDRESS, amount: amount + 1 }),
    ).rejects.toThrow(/amount/i);
  });

  it("rejects a request whose signed amount was tampered with", async () => {
    const body = await buildAuthorizations(PROBE_ADDRESS, amount);
    const parsed = JSON.parse(JSON.stringify(body.authorization)) as {
      requests: { inputs: string[] }[];
    };
    parsed.requests[0].inputs[1] = `${amount + 1}u64`;
    await expect(
      verifyAuthorizations(
        { ...body, authorization: parsed as unknown as Record<string, unknown> },
        { recipient: PROBE_ADDRESS, amount: amount + 1 },
      ),
    ).rejects.toThrow(/verify/i);
  });

  it("rejects a missing fee authorization", async () => {
    const body = await buildAuthorizations(PROBE_ADDRESS, amount);
    await expect(
      verifyAuthorizations(
        { authorization: body.authorization, broadcast: true },
        { recipient: PROBE_ADDRESS, amount },
      ),
    ).rejects.toThrow(/fee authorization/i);
  });

  it("builds and broadcasts a transaction the devnode confirms", async () => {
    const before = await getPublicBalance(PROBE_ADDRESS);
    const { id } = await buildTransaction({ recipient: PROBE_ADDRESS, amount });
    await advanceBlocks(1);

    expect(await getPublicBalance(PROBE_ADDRESS)).toBe(before + BigInt(amount));
    await expect(getTransaction(id)).resolves.toMatchObject({ id });
  });

  it("answers the shape logic/broadcast.ts reads", async () => {
    const body = await buildAuthorizations(PROBE_ADDRESS, amount);
    const response = await handleProve(body, { recipient: PROBE_ADDRESS, amount });
    await advanceBlocks(1);

    expect(typeof response.transaction.id).toBe("string");
    expect(response.transaction.id.startsWith("at1")).toBe(true);
    expect(response.broadcast_result.status).toBe("Accepted");
  });
});

describe("v2 handlers and indexer", () => {
  it("shapes blocks/latest the way lastBlock reads it", async () => {
    const block = await fetchLatestBlockV2();
    expect(typeof block.block_hash).toBe("string");
    expect(typeof block.previous_hash).toBe("string");
    expect(block.header.metadata.height).toBeGreaterThanOrEqual(1);
    expect(typeof block.header.metadata.timestamp).toBe("number");
  });

  it("passes the credits mapping through, null for an unknown address", async () => {
    await expect(fetchAccountBalanceV2(GENESIS_ACCOUNT.address)).resolves.toMatch(/u64$/);
    await expect(fetchAccountBalanceV2(RECIPIENT_ACCOUNT.address)).resolves.toBeNull();
  });

  it("emits one row per indexed credits.aleo transition", async () => {
    // Tasks 5 and 6 already sent transfer_public to PROBE_ADDRESS.
    const rows = await scanIndexedTransfers();
    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      expect(row.program_id).toBe("credits.aleo");
      expect(row.function_id).toBe("transfer_public");
      expect(row.transaction_status).toBe("Accepted");
      expect(row.sender_address).toBe(GENESIS_ACCOUNT.address);
      expect(row.recipient_address.startsWith("aleo1")).toBe(true);
      expect(row.amount).toBeGreaterThan(0);
      expect(row.fee).toBeGreaterThan(0);
      // Unix seconds as a string: parseTransactionFields does Number(...) * 1000.
      expect(row.block_timestamp).toMatch(/^\d+$/);
      expect(new Date(Number(row.block_timestamp) * 1000).toString()).not.toBe("Invalid Date");
      expect(row.block_number).toBeGreaterThanOrEqual(1);
    }
  });

  it("filters rows by address on either side of the transfer", async () => {
    const sent = await getAccountTransactionRows(GENESIS_ACCOUNT.address);
    const received = await getAccountTransactionRows(PROBE_ADDRESS);
    expect(sent.length).toBeGreaterThan(0);
    expect(received.length).toBeGreaterThan(0);
    expect(received.every(row => row.recipient_address === PROBE_ADDRESS)).toBe(true);
  });

  it("returns an empty list for an address the chain never saw", async () => {
    await expect(getAccountTransactionRows(RECIPIENT_ACCOUNT.address)).resolves.toStrictEqual([]);
  });

  it("shapes transactions/{id} with the block fields the details type demands", async () => {
    const [row] = await scanIndexedTransfers();
    const details = await fetchTransactionV2(row.transaction_id);

    expect(details.id).toBe(row.transaction_id);
    expect(details.status).toBe("Accepted");
    expect(details.block_height).toBe(row.block_number);
    expect(details.block_hash).toBe(row.block_hash);
    expect(details.block_timestamp).toBe(row.block_timestamp);
    expect(details.fee_value).toBe(row.fee);
    expect(details.execution.transitions.length).toBeGreaterThan(0);
    expect(details.fee.transition.function).toMatch(/^fee_/);
  });
});

describe("Aleo transfer_public scenario", () => {
  it("sends public credits through the bridge", async () => {
    await executeScenario(scenarioTransferPublic);
  });
});
