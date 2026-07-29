import { execFileSync } from "child_process";
import path from "path";
import chalk from "chalk";
import * as compose from "docker-compose";
import { ALEO_LOCAL_NODE, ALEO_NETWORK_TYPE } from "./fixtures";

const PACKAGE_ROOT = path.resolve(__dirname, "..");
const DOWN_ARGS = ["--remove-orphans", "--volumes"];
/** Must match `container_name` of every service in docker-compose.yml. */
const CONTAINER_NAMES = ["aleo-devnode", "aleo-backend"];

const composeOpts = () => ({
  cwd: PACKAGE_ROOT,
  log: Boolean(process.env.DEBUG),
  env: process.env,
});

let stopped = true;
let teardownRegistered = false;

/**
 * Best-effort synchronous teardown, for signal and exit handlers only.
 *
 * Two reasons it is neither async nor `compose down`:
 *  - async is useless here, because the runner exits without awaiting pending
 *    promises, so a `compose.down()` promise would never settle;
 *  - `compose down` is too slow to finish. Ctrl-C reaches the whole process
 *    group, so pnpm dies alongside this process and takes it down mid-teardown.
 *    A single `docker rm -f` on the known container names is the fastest call
 *    that frees ports 3030 and 3031, which gives it the best odds of
 *    completing in that window.
 *
 * This is a race that cannot be won reliably — the process may be killed at any
 * point. The actual guarantee comes from spawnStack cleaning up first.
 */
function killStackSync() {
  if (stopped) return;
  stopped = true;
  try {
    execFileSync("docker", ["rm", "-f", ...CONTAINER_NAMES], {
      cwd: PACKAGE_ROOT,
      stdio: process.env.DEBUG ? "inherit" : "ignore",
    });
  } catch {
    // Best effort: the handler must not throw on its way out.
  }
}

/** Tears the stack down on the ways a run can end without unwinding normally. */
function registerTeardownHooks() {
  if (teardownRegistered) return;
  teardownRegistered = true;

  process.on("exit", killStackSync);

  // Signals need an explicit exit: registering a listener replaces Node's
  // default terminate-on-signal behaviour, so without this the run would hang.
  for (const signal of ["SIGINT", "SIGQUIT", "SIGTERM", "SIGUSR1", "SIGUSR2"] as const) {
    process.on(signal, () => {
      killStackSync();
      process.exit(signal === "SIGINT" ? 130 : 143);
    });
  }

  process.on("uncaughtException", error => {
    killStackSync();
    throw error;
  });
}

export async function spawnStack() {
  registerTeardownHooks();

  // Clear anything a previous run left behind. Interrupt-time teardown is a
  // race the harness can lose — when pnpm forwards Ctrl-C to the whole process
  // group, it can kill this process mid-`docker compose down` — so a run must
  // not depend on the previous one having exited cleanly. Without this, a stale
  // container keeps a port and the next run fails on a healthy-looking service
  // that is not the one it started.
  await compose.down({
    ...composeOpts(),
    commandOptions: DOWN_ARGS,
  });

  console.log("Building the stack images (devnode: leo binary download; backend: cargo build)...");
  await compose.buildAll(composeOpts());

  console.log("Starting the Aleo stack...");
  stopped = false;
  // `--wait` blocks on both compose healthchecks, which only pass once each
  // service is actually serving, not merely once its process is up.
  await compose.upAll({
    ...composeOpts(),
    commandOptions: ["--wait"],
  });

  const height = await getBlockHeight();
  console.log(chalk.bgBlueBright(` -  ALEO STACK READY ✅  (height ${height})  - `));
}

export async function killStack() {
  if (stopped) return;
  stopped = true;

  console.log("Stopping the Aleo stack...");
  await compose.down({
    ...composeOpts(),
    commandOptions: DOWN_ARGS,
  });
}

export async function getBlockHeight(): Promise<number> {
  const response = await fetch(`${ALEO_LOCAL_NODE}/${ALEO_NETWORK_TYPE}/block/height/latest`);
  if (!response.ok) {
    throw new Error(`Could not read the latest block height: HTTP ${response.status}`);
  }
  return Number(await response.text());
}

/**
 * Seals `count` blocks.
 *
 * There is no consensus behind a devnode: it seals a block when a transaction
 * is broadcast, or when asked to here, and otherwise sits still. Scenarios that
 * wait on a height moving — confirmations, a finalized mapping read — have to
 * drive it explicitly rather than sleep.
 *
 * This is the endpoint `leo devnode advance` calls.
 */
export async function advanceBlocks(count = 1): Promise<number> {
  for (let i = 0; i < count; i++) {
    // The empty JSON object is not decoration: the route deserializes a body,
    // so no body at all is a 500 and a missing content-type a 415. One call
    // seals exactly one block.
    const response = await fetch(`${ALEO_LOCAL_NODE}/${ALEO_NETWORK_TYPE}/block/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!response.ok) {
      throw new Error(`Could not advance the devnode: HTTP ${response.status}`);
    }
  }
  return getBlockHeight();
}
