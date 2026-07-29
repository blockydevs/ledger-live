import path from "path";
import chalk from "chalk";
import * as compose from "docker-compose";
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

/**
 * `--wait` returns on the compose healthcheck, which runs
 * `casper-devnet network <name> is-ready` inside the container, so no in-code
 * polling loop is needed. On failure the same command is run once directly:
 * "assets for <name> not found" is a legible diagnosis, an opaque `--wait`
 * timeout is not.
 */
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

/**
 * `--public-key` and `--account-hash` print bare hex on stdout with a
 * trailing newline. `--secret-key` prints a multi-line, CRLF-terminated PEM
 * block, not hex — treat it as PEM wherever it's consumed. The whole triple
 * is returned so the signature stays stable when the follow-up signer needs
 * the secret key.
 */
export async function deriveUser(
  index: number,
): Promise<{ publicKey: string; secretKey: string; accountHash: string }> {
  const derivationPath = userDerivationPath(index);
  const [publicKey, secretKey, accountHash] = await Promise.all(
    ["--public-key", "--secret-key", "--account-hash"].map(flag => derive(derivationPath, flag)),
  );
  return { publicKey, secretKey, accountHash };
}

// `compose.exec`'s command argument, if a string, is split on whitespace with
// no quote-awareness, so a quoted derivation path (it contains `'` marks)
// would be passed to the container with literal `"` characters and rejected
// as an undecodable path. Passing an array bypasses that split.
async function derive(derivationPath: string, flag: string): Promise<string> {
  const { out } = await compose.exec(
    DEVNET_SERVICE_NAME,
    ["casper-devnet", "derive", derivationPath, flag, "-o", "-"],
    composeOpts(),
  );
  return out.trim();
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
