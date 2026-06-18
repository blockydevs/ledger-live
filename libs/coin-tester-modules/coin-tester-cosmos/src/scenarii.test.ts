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
      if (e != "done") {
        await killBabylond();
        throw e;
      }
    }
  });
});

["exit", "SIGINT", "SIGQUIT", "SIGTERM", "SIGUSR1", "SIGUSR2", "uncaughtException"].map(e =>
  process.on(e, async () => {
    await killBabylond();
  }),
);
