import path from "path";
import chalk from "chalk";
import * as compose from "docker-compose";
import { getCasperNodeRpcClient } from "@ledgerhq/coin-casper/api";
import {
  DEVNET_CHAIN_NAME,
  DEVNET_RPC_URL,
  DEVNET_SERVICE_NAME,
  userDerivationPath,
} from "./fixtures";

const PACKAGE_ROOT = path.resolve(__dirname, "..");

const composeOpts = () => ({
  cwd: PACKAGE_ROOT,
  log: Boolean(process.env.DEBUG),
  env: process.env,
});

// `--wait` blocks on the compose healthcheck; on failure, re-run the readiness
// check once for a legible error instead of an opaque timeout.
export async function spawnDevnet(): Promise<void> {
  console.log("Starting casper devnet…");
  try {
    await compose.upOne(DEVNET_SERVICE_NAME, {
      ...composeOpts(),
      commandOptions: ["--wait"],
    });
  } catch (error) {
    const diagnosis = await readinessDiagnosis();
    throw new Error(
      `casper devnet did not become healthy: ${String(error)}\n` +
        `network ${DEVNET_CHAIN_NAME} is-ready → ${diagnosis}`,
    );
  }
  console.log(chalk.bgBlueBright(" -  CASPER DEVNET READY ✅  - "));
}

export async function killDevnet(): Promise<void> {
  console.log("Stopping casper devnet…");
  await compose.down({
    ...composeOpts(),
    commandOptions: ["--remove-orphans", "--volumes"],
  });
}

async function readinessDiagnosis(): Promise<string> {
  try {
    const { out } = await compose.exec(
      DEVNET_SERVICE_NAME,
      `casper-devnet network ${DEVNET_CHAIN_NAME} is-ready`,
      composeOpts(),
    );
    return out.trim();
  } catch (error) {
    return `command itself failed: ${String(error)}`;
  }
}

// `--secret-key` prints a CRLF PEM block, unlike the bare-hex `--public-key`
// and `--account-hash` output.
export async function deriveUser(
  index: number,
): Promise<{ publicKey: string; secretKey: string; accountHash: string }> {
  const derivationPath = userDerivationPath(index);
  const [publicKey, secretKey, accountHash] = await Promise.all(
    ["--public-key", "--secret-key", "--account-hash"].map(flag => derive(derivationPath, flag)),
  );
  return { publicKey, secretKey, accountHash };
}

// Passed as an array: compose.exec splits a string command on whitespace,
// which would break the derivation path's `'` characters.
async function derive(derivationPath: string, flag: string): Promise<string> {
  const { out } = await compose.exec(
    DEVNET_SERVICE_NAME,
    ["casper-devnet", "derive", derivationPath, flag, "-o", "-"],
    composeOpts(),
  );
  return out.trim();
}

// Best-effort teardown on exit/interrupt so an aborted run doesn't leak containers.
["exit", "SIGINT", "SIGQUIT", "SIGTERM", "SIGUSR1", "SIGUSR2", "uncaughtException"].forEach(e =>
  process.on(e, () => {
    killDevnet().catch(() => {});
  }),
);

// chainspecBytes is a hex-encoded TOML document; `_` digit separators are
// stripped before parsing.
export async function nativeTransferMinimumMotes(): Promise<string> {
  const { chainspecBytes } = await getCasperNodeRpcClient().getChainspec();
  const toml = Buffer.from(chainspecBytes.chainspecBytes ?? "", "hex").toString("utf-8");
  const match = toml.match(/^native_transfer_minimum_motes\s*=\s*([\d_]+)/m);
  if (!match) {
    throw new Error(`native_transfer_minimum_motes not found in chainspec:\n${toml}`);
  }
  return match[1].replace(/_/g, "");
}

/** The only RPC call this package makes outside the module, used purely for diagnosis. */
export async function rawAccountInfo(publicKey: string): Promise<string> {
  const response = await fetch(DEVNET_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "state_get_account_info",
      params: { public_key: publicKey },
    }),
  });
  return `HTTP ${response.status} ${await response.text()}`;
}
