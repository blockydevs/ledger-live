import { executeScenario } from "@ledgerhq/coin-tester/main";
import { killGoloop } from "./goloop";
import { scenarioSodax } from "./scenarii/sodax";

global.console = require("console");
jest.setTimeout(600_000);

["exit", "SIGINT", "SIGQUIT", "SIGTERM", "SIGUSR1", "SIGUSR2", "uncaughtException"].forEach(e =>
  process.on(e, async () => {
    await killGoloop();
  }),
);

describe("SODAX", () => {
  it("scenario sodax", async () => {
    try {
      await executeScenario(scenarioSodax);
    } catch (e) {
      if (e !== "done") {
        await killGoloop();
        throw e;
      }
    }
  });
});
