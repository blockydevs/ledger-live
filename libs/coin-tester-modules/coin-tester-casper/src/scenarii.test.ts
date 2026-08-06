import console from "console";
import { executeScenario } from "@ledgerhq/coin-tester/main";
import { killDevnet } from "./casperDevnet";
import { scenarioCasper } from "./scenarii/casper";

global.console = console;
jest.setTimeout(600_000);

describe("Casper Deterministic Tester", () => {
  it("scenario Casper", async () => {
    try {
      await executeScenario(scenarioCasper);
    } catch (e) {
      if (e !== "done") {
        throw e;
      }
    }
  });
});

// Best-effort teardown for SIGTERM/uncaughtException so an interrupted run
// doesn't leak the container. Ctrl-C isn't reliably covered here — the
// scenario's own teardown handles that case.
["exit", "SIGINT", "SIGQUIT", "SIGTERM", "SIGUSR1", "SIGUSR2", "uncaughtException"].forEach(e =>
  process.on(e, () => {
    killDevnet().catch(() => {});
  }),
);
