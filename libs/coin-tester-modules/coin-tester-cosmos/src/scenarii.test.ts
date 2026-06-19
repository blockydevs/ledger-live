import console from "console";
import { executeScenario } from "@ledgerhq/coin-tester/main";
import { killBabylond } from "./babylond";
import { BabylonScenario } from "./scenarii/Babylon";

global.console = console;
jest.setTimeout(600_000);

describe("Cosmos Deterministic Tester", () => {
  it("scenario Babylon", async () => {
    try {
      await executeScenario(BabylonScenario);
    } catch (e) {
      if (e !== "done") {
        await killBabylond();
        throw e;
      }
    }
  });
});

// `exit` (and some signal paths) won't await pending promises, so the handler
// must trigger teardown synchronously rather than awaiting it.
["exit", "SIGINT", "SIGQUIT", "SIGTERM", "SIGUSR1", "SIGUSR2", "uncaughtException"].forEach(event => {
  process.on(event, () => {
    void killBabylond();
  });
});
