import console from "console";
import { executeScenario } from "@ledgerhq/coin-tester/main";
import { killDevnet } from "./casperDevnet";
import { scenarioCasper } from "./scenarii/casper";

global.console = console;
jest.setTimeout(600_000);

describe("Casper Deterministic Tester", () => {
  it("scenario Casper", async () => {
    await executeScenario(scenarioCasper);
  });
});

// Best-effort teardown for SIGTERM from CI and uncaughtException. Without it an
// interrupted run leaves the container behind. Ctrl-C is not reliably covered:
// `docker compose down` cannot finish from a handler that runs after the event
// loop stopped — the scenario's own teardown is the path that works there.
["exit", "SIGINT", "SIGQUIT", "SIGTERM", "SIGUSR1", "SIGUSR2", "uncaughtException"].forEach(e =>
  process.on(e, () => {
    killDevnet().catch(() => {});
  }),
);
