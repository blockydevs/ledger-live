import path from "path";
import * as compose from "docker-compose";
import { GENESIS_BALANCE_HEX, GOD_ADDRESS, GOD_KEYSTORE_JSON } from "./fixtures";

// docker-compose.yml and goloop.Dockerfile live at the package root, one level
// up from src/. compose resolves the compose file and its build context
// relative to cwd.
const PACKAGE_ROOT = path.resolve(__dirname, "..");
const SERVICE = "goloop";

// DEV_ADDRESS is read at call time, not at module load: the scenario's setup()
// generates a fresh dev wallet and sets process.env.DEV_ADDRESS before calling
// spawnGoloop().
function composeOptions() {
  return {
    cwd: PACKAGE_ROOT,
    log: Boolean(process.env.DEBUG),
    env: {
      ...process.env,
      GOD_ADDRESS,
      DEV_ADDRESS: process.env.DEV_ADDRESS ?? "",
      GENESIS_BALANCE: GENESIS_BALANCE_HEX,
      GOD_KEYSTORE_JSON,
    },
  };
}

export async function spawnGoloop(): Promise<void> {
  console.log("Starting goloop...");
  // `--build` keeps the image in sync with goloop.Dockerfile and entrypoint.sh.
  // Without it a stale image runs the previous entrypoint against a fresh
  // genesis, and an entrypoint edit has no effect on the next run.
  await compose.upOne(SERVICE, {
    ...composeOptions(),
    commandOptions: ["--wait", "--build", "--force-recreate"],
  });
  console.log(" -  GOLOOP READY ✅  - ");
}

// A Scenario's teardown hook owns the primary call to killGoloop, but two
// other callers can reach it: the jest afterAll hook and the process-signal
// handlers below. The guard here makes killGoloop itself idempotent, so
// any caller can invoke it safely regardless of who runs first.
let teardownStarted = false;

export async function killGoloop(): Promise<void> {
  if (teardownStarted) return;
  teardownStarted = true;
  console.log("Stopping goloop...");
  await compose.down({
    ...composeOptions(),
    commandOptions: ["--remove-orphans", "--volumes"],
  });
}

["exit", "SIGINT", "SIGQUIT", "SIGTERM", "SIGUSR1", "SIGUSR2", "uncaughtException"].forEach(
  event => {
    process.on(event, () => {
      // Swallow rejections: a failed teardown must not mask the original error.
      void killGoloop().catch(() => {});
    });
  },
);
