import { broadcastTransaction, getProgramSource } from "../devnode";
import { ALEO_LOCAL_NODE, GENESIS_ACCOUNT, TRANSFER_PUBLIC_BASE_FEE } from "../fixtures";
import type { AleoWasm } from "../wasm";
import { loadAleoWasm } from "../wasm";

const CREDITS_PROGRAM = "credits.aleo";
const TRANSFER_FUNCTION = "transfer_public";
const TRANSFER_INPUT_TYPES = ["address.public", "u64.public"];
const FEE_INPUT_TYPES = ["u64.public", "u64.public", "field.public"];

export type ExpectedTransfer = {
  recipient: string;
  amount: number;
  /**
   * Who `buildTransaction` signs the devnode transaction as. Defaults to
   * GENESIS_ACCOUNT: `buildDevnodeExecutionTransaction` needs a plaintext
   * private key to build a proofless transaction and does not consume the
   * incoming authorization, so whoever actually holds the authorization is
   * irrelevant to it — only this field decides who spends on-chain.
   */
  senderPrivateKey?: string;
};

export type ProveRequestBody = {
  authorization: Record<string, unknown>;
  fee_authorization?: Record<string, unknown>;
  broadcast: boolean;
};

export type ProveResponse = {
  transaction: { id: string };
  broadcast_result: { status: string };
};

/**
 * Recovers a signed `ExecutionRequest` from an Authorization.
 *
 * Authorization exposes no accessor for its requests, so the way in is
 * `toString()`: snarkVM 4.5.4 serializes it as `{"requests": [...],
 * "transitions": [...]}`.
 */
// `InstanceType<AleoWasm["Authorization"]>` does not typecheck: the wasm classes
// declare a private constructor, so they are not assignable to a construct
// signature. The static factories give the same instance types.
type WasmAuthorization = ReturnType<AleoWasm["Authorization"]["fromString"]>;
type WasmExecutionRequest = ReturnType<AleoWasm["ExecutionRequest"]["fromString"]>;

function recoverRequest(
  wasm: AleoWasm,
  authorization: WasmAuthorization,
  index: number,
): WasmExecutionRequest {
  const parsed = JSON.parse(authorization.toString()) as { requests?: unknown[] };
  const raw = parsed.requests?.[index];
  if (!raw) {
    throw new Error(`aleo coin-tester: authorization has no request at index ${index}`);
  }
  return wasm.ExecutionRequest.fromString(JSON.stringify(raw));
}

/**
 * Checks everything about the request that is still true at this point.
 *
 * The fee assertions are load-bearing: this is the only place where the fee the
 * bridge computed is still visible. `buildTransaction` does not carry it over.
 */
export async function verifyAuthorizations(
  body: ProveRequestBody,
  expected: ExpectedTransfer,
): Promise<void> {
  const wasm = await loadAleoWasm();

  const authorization = wasm.Authorization.fromString(JSON.stringify(body.authorization));
  const request = recoverRequest(wasm, authorization, 0);

  if (request.programId() !== CREDITS_PROGRAM || request.functionName() !== TRANSFER_FUNCTION) {
    throw new Error(
      `aleo coin-tester: expected ${CREDITS_PROGRAM}/${TRANSFER_FUNCTION}, got ${request.programId()}/${request.functionName()}`,
    );
  }
  if (!request.verify(TRANSFER_INPUT_TYPES, true)) {
    throw new Error("aleo coin-tester: the transfer request failed verify()");
  }

  const [recipient, amount] = request.inputs() as string[];
  if (recipient !== expected.recipient) {
    throw new Error(
      `aleo coin-tester: signed recipient ${recipient} does not match the expected ${expected.recipient}`,
    );
  }
  if (amount !== `${expected.amount}u64`) {
    throw new Error(
      `aleo coin-tester: signed amount ${amount} does not match the expected ${expected.amount}u64`,
    );
  }

  if (!body.fee_authorization) {
    throw new Error(
      "aleo coin-tester: missing fee authorization — the tester runs with isFeeSponsored: false",
    );
  }

  const feeAuthorization = wasm.Authorization.fromString(JSON.stringify(body.fee_authorization));
  if (!feeAuthorization.isFeePublic()) {
    throw new Error(
      `aleo coin-tester: expected a fee_public authorization, got ${feeAuthorization.functionName()}`,
    );
  }
  const feeRequest = recoverRequest(wasm, feeAuthorization, 0);
  if (!feeRequest.verify(FEE_INPUT_TYPES, true)) {
    throw new Error("aleo coin-tester: the fee request failed verify()");
  }

  const [baseFee, priorityFee] = feeRequest.inputs() as string[];
  if (baseFee !== `${TRANSFER_PUBLIC_BASE_FEE}u64`) {
    throw new Error(
      `aleo coin-tester: expected a base fee of ${TRANSFER_PUBLIC_BASE_FEE}u64, got ${baseFee}`,
    );
  }
  if (priorityFee !== "0u64") {
    throw new Error(`aleo coin-tester: expected a priority fee of 0u64, got ${priorityFee}`);
  }
}

/**
 * Produces the transaction the devnode will accept.
 *
 * `buildDevnodeExecutionTransaction` starts from a private key and signs afresh,
 * so it does not consume the incoming authorization. It also takes no base fee,
 * only a priority fee — the devnode charges what a proofless transaction costs,
 * which is less than the 34060 the bridge billed.
 *
 * The callable is the static `ProgramManagerBase.buildDevnodeExecutionTransaction`,
 * taking positional arguments. `ProgramManager`'s same-named method is an
 * instance method that takes a single options object; calling it positionally
 * throws a `getProgramObject` error. The `url` argument is the bare
 * `ALEO_LOCAL_NODE` — the wasm client appends its own network segment, so a
 * network-qualified base would double into `/testnet/testnet/...` and 404.
 */
export async function buildTransaction(expected: ExpectedTransfer): Promise<{ id: string }> {
  const wasm = await loadAleoWasm();

  const transaction = await wasm.ProgramManagerBase.buildDevnodeExecutionTransaction(
    wasm.PrivateKey.from_string(expected.senderPrivateKey ?? GENESIS_ACCOUNT.privateKey),
    await getProgramSource(CREDITS_PROGRAM),
    TRANSFER_FUNCTION,
    [expected.recipient, `${expected.amount}u64`],
    0,
    undefined,
    ALEO_LOCAL_NODE,
  );

  await broadcastTransaction(transaction.toString());

  return { id: transaction.id() };
}

export async function handleProve(
  body: ProveRequestBody,
  expected: ExpectedTransfer,
): Promise<ProveResponse> {
  await verifyAuthorizations(body, expected);
  const transaction = await buildTransaction(expected);

  return { transaction, broadcast_result: { status: "Accepted" } };
}
