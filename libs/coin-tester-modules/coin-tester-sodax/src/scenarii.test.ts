import { executeScenario } from "@ledgerhq/coin-tester/main";
import { scenarioSodax } from "./scenarii/sodax";

global.console = require("console");
jest.setTimeout(600_000);

describe("SODAX", () => {
  it("scenario sodax", async () => {
    try {
      await executeScenario(scenarioSodax);
    } catch (e) {
      if (e !== "done") throw e;
    }
  });
});
