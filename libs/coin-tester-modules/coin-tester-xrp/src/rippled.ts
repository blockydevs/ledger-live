import path from "path";
import chalk from "chalk";
import * as compose from "docker-compose";
import { encode } from "ripple-binary-codec";
import { deriveAddress, deriveKeypair, generateSeed, sign } from "ripple-keypairs";
import { TX_SIGN_PREFIX } from "./signer";

export const XRP_LOCAL_RPC = "http://127.0.0.1:5005";

/**
 * The XRPL family seed for the genesis "masterpassphrase" account, which
 * holds the full 100B XRP supply at the start of a `--standalone --start`
 * network. Decodes to address `rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh`.
 */
export const GENESIS_SEED = "snoPBrXtMeMyMHUVTgbuqAfg1SUTb";
export const GENESIS_ADDRESS = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";

const PACKAGE_ROOT = path.resolve(__dirname, "..");

const composeOpts = () => ({
  cwd: PACKAGE_ROOT,
  log: Boolean(process.env.DEBUG),
  env: process.env,
});

type RpcResponse<T> = { result: T & { status?: string; error?: string; error_message?: string } };

async function rpcCall<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(XRP_LOCAL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, params: [params] }),
  });
  if (!res.ok) throw new Error(`rippled ${method} → HTTP ${res.status}`);
  const body = (await res.json()) as RpcResponse<T>;
  if (body.result.status === "error") {
    throw new Error(`rippled ${method} → ${body.result.error_message ?? body.result.error}`);
  }
  return body.result;
}

export async function spawnRippled(): Promise<void> {
  console.log("Starting rippled (standalone)…");
  // The container's healthcheck (see docker-compose.yml) only reports
  // healthy once `server_state` is one of the ready states, so by the
  // time `--wait` returns rippled is fully primed.
  await compose.upOne("rippled", { ...composeOpts(), commandOptions: ["--wait"] });
  console.log(chalk.bgBlueBright(" -  RIPPLED READY ✅  - "));
}

export async function killRippled(): Promise<void> {
  console.log("Stopping rippled…");
  await compose.down({ ...composeOpts(), commandOptions: ["--remove-orphans", "--volumes"] });
}

export async function closeLedger(): Promise<number> {
  const res = await rpcCall<{ ledger_current_index: number }>("ledger_accept");
  return res.ledger_current_index;
}

export async function getCurrentLedgerIndex(): Promise<number> {
  const res = await rpcCall<{ ledger_current_index: number }>("ledger_current");
  return res.ledger_current_index;
}

async function getNextSequence(address: string): Promise<number> {
  const res = await rpcCall<{ account_data: { Sequence: number } }>("account_info", {
    account: address,
    ledger_index: "current",
  });
  return res.account_data.Sequence;
}

/** A key pair that signs in-process, outside the coin module under test. */
export type XrplWallet = { address: string; publicKey: string; privateKey: string };

export function walletFromSeed(seed: string): XrplWallet {
  const { publicKey, privateKey } = deriveKeypair(seed);
  return { address: deriveAddress(publicKey), publicKey, privateKey };
}

export function newWallet(): XrplWallet {
  return walletFromSeed(generateSeed({ algorithm: "ecdsa-secp256k1" }));
}

export type TxMeta = { TransactionResult: string; [field: string]: unknown };

/**
 * Fills `Sequence`, `Fee`, `LastLedgerSequence` and `SigningPubKey`, signs `tx` with `wallet`,
 * submits it and closes the ledger. Throws unless the validated result is `tesSUCCESS`.
 */
export async function signAndSubmit(
  wallet: XrplWallet,
  tx: Record<string, unknown>,
): Promise<{ hash: string; meta: TxMeta }> {
  const filled = {
    Fee: "10",
    Flags: 0,
    ...tx,
    Account: wallet.address,
    Sequence: await getNextSequence(wallet.address),
    LastLedgerSequence: (await getCurrentLedgerIndex()) + 20,
    SigningPubKey: wallet.publicKey,
  };
  const signature = sign(TX_SIGN_PREFIX + encode(filled), wallet.privateKey);
  const submit = await rpcCall<{
    engine_result: string;
    engine_result_message: string;
    tx_json: { hash: string };
  }>("submit", { tx_blob: encode({ ...filled, TxnSignature: signature }) });

  if (submit.engine_result !== "tesSUCCESS" && submit.engine_result !== "terQUEUED") {
    throw new Error(
      `${String(tx.TransactionType)} rejected: ${submit.engine_result} ${submit.engine_result_message}`,
    );
  }

  const meta = await waitForValidation(submit.tx_json.hash);
  if (meta.TransactionResult !== "tesSUCCESS") {
    throw new Error(`${String(tx.TransactionType)} failed on-chain: ${meta.TransactionResult}`);
  }
  return { hash: submit.tx_json.hash, meta };
}

/** Funds `address` with `xrpAmount` XRP from the genesis account. */
export async function fundAccount(address: string, xrpAmount: number): Promise<string> {
  const { hash } = await signAndSubmit(walletFromSeed(GENESIS_SEED), {
    TransactionType: "Payment",
    Destination: address,
    Amount: String(Math.trunc(xrpAmount * 1_000_000)),
  });
  return hash;
}

/**
 * Closes the open ledger, which validates every queued tx, and returns the tx metadata.
 * `ledger_accept` blocks until the close is done, so one `tx` lookup is enough.
 */
async function waitForValidation(hash: string): Promise<TxMeta> {
  await closeLedger();
  const res = await rpcCall<{ validated?: boolean; meta?: TxMeta }>("tx", {
    transaction: hash,
    binary: false,
  });
  if (!res.validated || !res.meta) {
    throw new Error(`tx ${hash} was not validated after ledger_accept`);
  }
  return res.meta;
}

/** Validates a tx broadcast by the bridge. Throws unless its result is `tesSUCCESS`. */
export async function waitForOperationInclusion(hash: string): Promise<void> {
  const meta = await waitForValidation(hash);
  if (meta.TransactionResult !== "tesSUCCESS") {
    throw new Error(`tx ${hash} failed on-chain: ${meta.TransactionResult}`);
  }
}

/** The `balance` of `holder`'s `currency` trust line to `issuer`, or `undefined` if the line does not exist. */
export async function getTrustLineBalance(
  holder: string,
  currency: string,
  issuer: string,
): Promise<string | undefined> {
  const { lines } = await rpcCall<{ lines: { currency: string; balance: string }[] }>(
    "account_lines",
    { account: holder, peer: issuer, ledger_index: "validated" },
  );

  return lines.find(line => line.currency === currency)?.balance;
}

/** The base-unit balance of `holder`'s MPToken for `issuanceId`, or `undefined` if it holds none. */
export async function getMptBalance(
  holder: string,
  issuanceId: string,
): Promise<string | undefined> {
  const { account_objects } = await rpcCall<{
    account_objects: { MPTokenIssuanceID: string; MPTAmount?: string }[];
  }>("account_objects", { account: holder, type: "mptoken", ledger_index: "validated" });
  const mpToken = account_objects.find(object => object.MPTokenIssuanceID === issuanceId);

  // MPTAmount is omitted at 0
  return mpToken && (mpToken.MPTAmount ?? "0");
}

/** The next `Sequence` of `address`: it grows by one with each transaction the account submits. */
export async function getAccountSequence(address: string): Promise<number> {
  const { account_data } = await rpcCall<{ account_data: { Sequence: number } }>("account_info", {
    account: address,
    ledger_index: "current",
  });

  return account_data.Sequence;
}
