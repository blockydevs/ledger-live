import { executeScenario } from "@ledgerhq/coin-tester/main";
import { scenarioXrp } from "./scenarii/xrp";
import { scenarioXrpIou } from "./scenarii/xrpIou";
import { scenarioXrpMpt } from "./scenarii/xrpMpt";

jest.setTimeout(600_000);

describe("XRP", () => {
  it.each([
    ["scenario xrp", scenarioXrp],
    ["scenario xrp iou", scenarioXrpIou],
    ["scenario xrp mpt", scenarioXrpMpt],
  ])("%s", async (_name, scenario) => {
    try {
      await executeScenario(scenario);
    } catch (e) {
      if (e !== "done") throw e;
    }
  });
});
