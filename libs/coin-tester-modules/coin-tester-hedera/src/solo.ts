import { execFile } from "child_process";
import { rm } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { promisify } from "util";
import chalk from "chalk";

const execFileAsync = promisify(execFile);

const EXEC_OPTS = { env: process.env, maxBuffer: 1024 * 1024 * 64 } as const;

const SOLO_BIN = "solo"; // resolved from the package's own node_modules/.bin via pnpm

/** Dedicated deployment + namespace, kept separate from Solo's default `one-shot` name. */
const DEPLOYMENT_NAME = "coin-tester-hedera";

/**
 * Memoised deployment: the *promise* is stored (not the resolved value) so concurrent callers
 * can't start two deploys. A failed bring-up is cached too — a kube/Solo failure is an
 * environment fault, so every caller should fail immediately rather than retry for ~10 min.
 */
let deployment: Promise<void> | undefined;

/** `solo one-shot falcon deploy` writes account material to `<SOLO_HOME>/one-shot-<deployment>/accounts.json`. */
const oneShotOutputDir = () =>
  join(process.env.SOLO_HOME ?? join(homedir(), ".solo"), `one-shot-${DEPLOYMENT_NAME}`);

export function deploySolo(): Promise<void> {
  deployment ??= runDeploy();
  return deployment;
}

async function runDeploy(): Promise<void> {
  console.log("Deploying Hiero Solo (one-shot falcon, single node)…");

  // `--no-deploy-relay`/`--no-deploy-explorer` skip the JSON-RPC relay and explorer pods — the
  // tester only ever talks to the consensus node and mirror node REST API.
  //
  // A hard-killed run bypasses `teardownSolo` and leaves state a later `deploy --quiet-mode`
  // rejects — recover with `solo one-shot falcon destroy --deployment coin-tester-hedera`.
  await execFileAsync(
    SOLO_BIN,
    [
      "one-shot",
      "falcon",
      "deploy",
      "--deployment",
      DEPLOYMENT_NAME,
      "--namespace",
      DEPLOYMENT_NAME,
      "--no-deploy-relay",
      "--no-deploy-explorer",
      "--quiet-mode",
    ],
    EXEC_OPTS,
  );

  console.log(chalk.bgBlueBright(" -  SOLO READY ✅  - "));
}

export async function teardownSolo(): Promise<void> {
  deployment = undefined;
  console.log("Tearing down Hiero Solo…");
  await destroyQuietly();
  // `destroy` skips removing the output dir when Solo's local config lists no deployment — the
  // state a hard-killed run leaves behind. Remove it ourselves: Solo rewrites it on every deploy.
  await rm(oneShotOutputDir(), { recursive: true, force: true });
  await killPortForwards();
}

/** Best-effort: must never throw during teardown, or it would mask the real test outcome. */
async function destroyQuietly(): Promise<void> {
  try {
    await execFileAsync(
      SOLO_BIN,
      ["one-shot", "falcon", "destroy", "--deployment", DEPLOYMENT_NAME, "--quiet-mode"],
      EXEC_OPTS,
    );
  } catch (err) {
    console.error("solo.ts: `one-shot falcon destroy` failed (ignored):", err);
  }
}

/** Solo's tunnels are spawned `detached` and outlive `destroy`, holding 35211/38081. Never throws. */
async function killPortForwards(): Promise<void> {
  if (process.platform === "win32") {
    console.warn(
      "solo.ts: no port-forward cleanup on Windows — if the next run cannot bind 35211/38081, " +
        "kill the leftover `kubectl port-forward` processes by hand.",
    );
    return;
  }

  // Order matters: `persist-port-forward` respawns a dropped tunnel, so its kubectl child must
  // not be killed first.
  const patterns = [
    `persist-port-forward.* ${DEPLOYMENT_NAME} `,
    `port-forward .*${DEPLOYMENT_NAME}`,
  ];

  for (const pattern of patterns) {
    await killMatching(pattern, "SIGTERM");
  }
  // `persist-port-forward` exits ~500 ms after SIGTERM (it lets its child wind down first).
  await new Promise(resolve => setTimeout(resolve, 1000));
  for (const pattern of patterns) {
    await killMatching(pattern, "SIGKILL");
  }
}

async function killMatching(pattern: string, signal: "SIGTERM" | "SIGKILL"): Promise<void> {
  let pids: number[];
  try {
    const { stdout } = await execFileAsync("pgrep", ["-f", pattern], EXEC_OPTS);
    pids = stdout.split("\n").map(Number).filter(Boolean);
  } catch {
    // pgrep exits 1 when nothing matched — the common, healthy case.
    return;
  }

  // `-f` matches whole command lines, so a shell merely mentioning the pattern matches too.
  // Never signal our own tree.
  const ownTree = await ancestorPids();

  for (const pid of pids) {
    if (ownTree.has(pid)) continue;
    try {
      process.kill(pid, signal);
      console.log(`solo.ts: sent ${signal} to leftover port-forward process ${pid}`);
    } catch {
      // Already exited between pgrep and kill, or not ours to kill.
    }
  }
}

/** Our own pid plus every parent up to init. */
async function ancestorPids(): Promise<Set<number>> {
  const pids = new Set<number>();
  let pid = process.pid;
  while (pid > 1 && !pids.has(pid)) {
    pids.add(pid);
    try {
      const { stdout } = await execFileAsync("ps", ["-o", "ppid=", "-p", String(pid)], EXEC_OPTS);
      pid = Number(stdout.trim());
    } catch {
      break;
    }
  }
  return pids;
}
