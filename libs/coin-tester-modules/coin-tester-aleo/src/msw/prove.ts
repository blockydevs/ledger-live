import { PROGRAM_ID } from "@ledgerhq/coin-aleo/constants";
import { broadcastTransaction, getProgramSource } from "../devnode";
import {
  ALEO_LOCAL_NODE,
  GENESIS_ACCOUNT,
  TRANSFER_PUBLIC_BASE_FEE,
  TRANSFER_PRIVATE_BASE_FEE,
  CONVERT_PUBLIC_TO_PRIVATE_BASE_FEE,
} from "../fixtures";
import { isRecordInputId, type RecordInputId } from "../recordInputId";
import type { AleoWasm } from "../wasm";
import { loadAleoWasm } from "../wasm";
import type { RecordStore } from "./records";

const TRANSFER_PUBLIC_FUNCTION = "transfer_public";
const TRANSFER_PUBLIC_INPUT_TYPES = ["address.public", "u64.public"];
const FEE_PUBLIC_INPUT_TYPES = ["u64.public", "u64.public", "field.public"];

const TRANSFER_PRIVATE_FUNCTION = "transfer_private";
const TRANSFER_PRIVATE_INPUT_TYPES = ["credits.record", "address.private", "u64.private"];
const FEE_PRIVATE_INPUT_TYPES = ["credits.record", "u64.public", "u64.public", "field.public"];

// credits.aleo/transfer_public_to_private: [address.private, u64.public], no record
// input — a public-balance conversion into a fresh private record. Its fee still
// runs through fee_public, at the CONVERT_PUBLIC_TO_PRIVATE rate.
const TRANSFER_PUBLIC_TO_PRIVATE_FUNCTION = "transfer_public_to_private";
const TRANSFER_PUBLIC_TO_PRIVATE_INPUT_TYPES = ["address.private", "u64.public"];

const KNOWN_TRANSFER_FUNCTIONS = new Set([
  TRANSFER_PUBLIC_FUNCTION,
  TRANSFER_PUBLIC_TO_PRIVATE_FUNCTION,
  TRANSFER_PRIVATE_FUNCTION,
]);

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
  /**
   * The store `buildTransaction` reads the amount and fee record plaintexts
   * from, keyed by the commitments carried in the prove request's own
   * `input_ids()`. Its presence is what selects the `transfer_private` path —
   * the public path never touches a record.
   */
  privateRecordStore?: RecordStore;
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
  const parsed = JSON.parse(authorization.toString()) as {
    requests?: unknown[];
  };
  const raw = parsed.requests?.[index];
  if (!raw) {
    throw new Error(`aleo coin-tester: authorization has no request at index ${index}`);
  }
  return wasm.ExecutionRequest.fromString(JSON.stringify(raw));
}

/**
 * `@provablehq/wasm` prints `_version: 0u8` on every decrypted record
 * plaintext regardless of the record's real version, which yields a
 * commitment the chain never produced. Bumping it by one reproduces the
 * chain's real commitment. See `docs/wasm-record-commitment.md`.
 */
export function correctRecordVersion(plaintext: string): string {
  const versionMatch = plaintext.match(/_version:\s*(\d+)u8/);
  if (!versionMatch) {
    throw new Error("aleo coin-tester: record plaintext carries no _version field");
  }
  const corrected = Number(versionMatch[1]) + 1;
  return plaintext.replace(/_version:\s*\d+u8/, `_version: ${corrected}u8`);
}

/**
 * Checks a transfer request's recipient and amount against what was expected,
 * at whichever input positions the caller's transfer function puts them —
 * `transfer_public`'s inputs are `[recipient, amount]`, `transfer_private`'s
 * are `[record, recipient, amount]`.
 */
function checkRecipientAndAmount(
  inputs: string[],
  recipientIndex: number,
  amountIndex: number,
  expected: ExpectedTransfer,
): void {
  const recipient = inputs[recipientIndex];
  const amount = inputs[amountIndex];
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
}

/**
 * Checks a fee request's base and priority fee, at whichever input positions
 * the caller's fee function puts them — `fee_public`'s inputs are
 * `[baseFee, priorityFee, executionId]`, `fee_private`'s are
 * `[record, baseFee, priorityFee, executionId]`.
 */
function checkFeeAmounts(
  inputs: string[],
  baseFeeIndex: number,
  priorityFeeIndex: number,
  expectedBaseFee: number,
): void {
  const baseFee = inputs[baseFeeIndex];
  const priorityFee = inputs[priorityFeeIndex];
  if (baseFee !== `${expectedBaseFee}u64`) {
    throw new Error(
      `aleo coin-tester: expected a base fee of ${expectedBaseFee}u64, got ${baseFee}`,
    );
  }
  if (priorityFee !== "0u64") {
    throw new Error(`aleo coin-tester: expected a priority fee of 0u64, got ${priorityFee}`);
  }
}

/**
 * This is the only place the fee the bridge computed is still visible —
 * `buildTransaction` does not carry it over. The assertions pin that the
 * bridge's configured `feeByTransactionType` entry survives the fee path
 * unchanged; they do not prove those constants are correct for the network.
 */
export async function verifyAuthorizations(
  body: ProveRequestBody,
  expected: ExpectedTransfer,
): Promise<void> {
  const wasm = await loadAleoWasm();

  const authorization = wasm.Authorization.fromString(JSON.stringify(body.authorization));
  const request = recoverRequest(wasm, authorization, 0);

  if (request.programId() !== PROGRAM_ID.CREDITS) {
    throw new Error(
      `aleo coin-tester: expected program ${PROGRAM_ID.CREDITS}, got ${request.programId()}`,
    );
  }

  const functionName = request.functionName();
  if (!KNOWN_TRANSFER_FUNCTIONS.has(functionName)) {
    throw new Error(
      `aleo coin-tester: expected ${TRANSFER_PUBLIC_FUNCTION}, ${TRANSFER_PUBLIC_TO_PRIVATE_FUNCTION}, or ${TRANSFER_PRIVATE_FUNCTION}, got ${functionName}`,
    );
  }

  if (functionName === TRANSFER_PRIVATE_FUNCTION) {
    if (!request.verify(TRANSFER_PRIVATE_INPUT_TYPES, true)) {
      throw new Error("aleo coin-tester: the private transfer request failed verify()");
    }
    checkRecipientAndAmount(request.inputs() as string[], 1, 2, expected);
  } else if (functionName === TRANSFER_PUBLIC_TO_PRIVATE_FUNCTION) {
    if (!request.verify(TRANSFER_PUBLIC_TO_PRIVATE_INPUT_TYPES, true)) {
      throw new Error("aleo coin-tester: the public-to-private conversion request failed verify()");
    }
    checkRecipientAndAmount(request.inputs() as string[], 0, 1, expected);
  } else {
    if (!request.verify(TRANSFER_PUBLIC_INPUT_TYPES, true)) {
      throw new Error("aleo coin-tester: the transfer request failed verify()");
    }
    checkRecipientAndAmount(request.inputs() as string[], 0, 1, expected);
  }

  if (!body.fee_authorization) {
    throw new Error(
      "aleo coin-tester: missing fee authorization — the tester runs with isFeeSponsored: false",
    );
  }
  const feeAuthorization = wasm.Authorization.fromString(JSON.stringify(body.fee_authorization));

  if (functionName === TRANSFER_PRIVATE_FUNCTION) {
    if (!feeAuthorization.isFeePrivate()) {
      throw new Error(
        `aleo coin-tester: expected a fee_private authorization, got ${feeAuthorization.functionName()}`,
      );
    }
    const feeRequest = recoverRequest(wasm, feeAuthorization, 0);
    if (!feeRequest.verify(FEE_PRIVATE_INPUT_TYPES, true)) {
      throw new Error("aleo coin-tester: the fee request failed verify()");
    }
    checkFeeAmounts(feeRequest.inputs() as string[], 1, 2, TRANSFER_PRIVATE_BASE_FEE);
  } else {
    if (!feeAuthorization.isFeePublic()) {
      throw new Error(
        `aleo coin-tester: expected a fee_public authorization, got ${feeAuthorization.functionName()}`,
      );
    }
    const feeRequest = recoverRequest(wasm, feeAuthorization, 0);
    if (!feeRequest.verify(FEE_PUBLIC_INPUT_TYPES, true)) {
      throw new Error("aleo coin-tester: the fee request failed verify()");
    }
    const expectedBaseFee =
      functionName === TRANSFER_PUBLIC_TO_PRIVATE_FUNCTION
        ? CONVERT_PUBLIC_TO_PRIVATE_BASE_FEE
        : TRANSFER_PUBLIC_BASE_FEE;
    checkFeeAmounts(feeRequest.inputs() as string[], 0, 1, expectedBaseFee);
  }
}

/** The commitment of a request's sole record input, read off `input_ids()`. */
function recordCommitment(request: WasmExecutionRequest): string {
  const [recordInputId] = request.input_ids().filter(isRecordInputId) as RecordInputId[];
  if (!recordInputId) {
    throw new Error("aleo coin-tester: expected a record input, found none in input_ids()");
  }
  return recordInputId[0].toString();
}

/** Looks up a request's record input in `store` and version-corrects its plaintext. */
function resolveRecordPlaintext(store: RecordStore, request: WasmExecutionRequest): string {
  const commitment = recordCommitment(request);
  const plaintext = store.plaintextByCommitment(commitment);
  if (!plaintext) {
    throw new Error(`aleo coin-tester: no record plaintext for commitment ${commitment}`);
  }
  return correctRecordVersion(plaintext);
}

/**
 * Produces the transaction the devnode will accept.
 *
 * `buildDevnodeExecutionTransaction` signs afresh from a private key, so it
 * doesn't consume the incoming authorization, and charges only a priority
 * fee — a proofless transaction's real devnode cost, below what the bridge
 * billed. Use the static `ProgramManagerBase` method, not the instance method
 * on `ProgramManager` (same name, options-object signature, throws
 * `getProgramObject` when called positionally). Pass the bare
 * `ALEO_LOCAL_NODE` as `url`: the wasm client appends its own network
 * segment, so a network-qualified base would double into `/testnet/testnet/...`.
 *
 * `body` is needed only for `transfer_private` (via
 * `expected.privateRecordStore`), to read the amount/fee record commitments
 * off each authorization's `input_ids()`; its root authorization also picks
 * `transfer_public` vs `transfer_public_to_private` when present. With no
 * authorization to read (the direct-to-devnode funding helpers), it defaults
 * to `transfer_public`.
 */
export async function buildTransaction(
  expected: ExpectedTransfer,
  body?: ProveRequestBody,
): Promise<{ id: string }> {
  const wasm = await loadAleoWasm();
  const senderPrivateKey = wasm.PrivateKey.from_string(
    expected.senderPrivateKey ?? GENESIS_ACCOUNT.privateKey,
  );
  const programSource = await getProgramSource(PROGRAM_ID.CREDITS);

  if (expected.privateRecordStore) {
    if (!body) {
      throw new Error(
        "aleo coin-tester: buildTransaction needs the prove request body to find the private records it spends",
      );
    }
    if (!body.fee_authorization) {
      throw new Error(
        "aleo coin-tester: buildTransaction needs a fee authorization to find the private fee record",
      );
    }

    const rootRequest = recoverRequest(
      wasm,
      wasm.Authorization.fromString(JSON.stringify(body.authorization)),
      0,
    );
    const feeRequest = recoverRequest(
      wasm,
      wasm.Authorization.fromString(JSON.stringify(body.fee_authorization)),
      0,
    );

    // The `inputs` array wants every element as a string (a bare RecordPlaintext
    // here throws "all inputs must be a string specifying the type"); `fee_record`
    // is the opposite — its own positional parameter, typed as a RecordPlaintext.
    const amountRecordPlaintext = resolveRecordPlaintext(expected.privateRecordStore, rootRequest);
    const feeRecordPlaintext = resolveRecordPlaintext(expected.privateRecordStore, feeRequest);

    const transaction = await wasm.ProgramManagerBase.buildDevnodeExecutionTransaction(
      senderPrivateKey,
      programSource,
      TRANSFER_PRIVATE_FUNCTION,
      [amountRecordPlaintext, expected.recipient, `${expected.amount}u64`],
      0,
      wasm.RecordPlaintext.fromString(feeRecordPlaintext),
      ALEO_LOCAL_NODE,
    );

    await broadcastTransaction(transaction.toString());
    return { id: transaction.id() };
  }

  const functionName = body
    ? recoverRequest(
        wasm,
        wasm.Authorization.fromString(JSON.stringify(body.authorization)),
        0,
      ).functionName()
    : TRANSFER_PUBLIC_FUNCTION;

  const devnodeFunction =
    functionName === TRANSFER_PUBLIC_TO_PRIVATE_FUNCTION
      ? TRANSFER_PUBLIC_TO_PRIVATE_FUNCTION
      : TRANSFER_PUBLIC_FUNCTION;

  const transaction = await wasm.ProgramManagerBase.buildDevnodeExecutionTransaction(
    senderPrivateKey,
    programSource,
    devnodeFunction,
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
  const transaction = await buildTransaction(expected, body);

  return { transaction, broadcast_result: { status: "Accepted" } };
}
