import chalk from "chalk";
import * as compose from "docker-compose";

const composeOptions = {
  cwd: __dirname,
  log: Boolean(process.env.DEBUG),
  env: process.env,
};

export async function spawnBabylond(): Promise<void> {
  console.log("Starting babylond...");
  // `--build` keeps the image in sync with babylond.Dockerfile + entrypoint.sh
  // edits. Docker's layer cache makes this near-instant when nothing changed;
  // without it, a stale image silently runs the previous entrypoint and the
  // 2-node devnet either races on /testnet/node0 or skips node 1 entirely.
  await compose.upAll({
    ...composeOptions,
    commandOptions: ["--wait", "--build"],
  });
  console.log(chalk.bgBlueBright(" -  BABYLOND READY ✅  - "));
}

export async function killBabylond(): Promise<void> {
  console.log("Stopping babylond...");
  await compose.down({
    ...composeOptions,
    commandOptions: ["--remove-orphans", "--volumes"],
  });
}
