import type { TransactionCommon } from "@ledgerhq/types-live";
import { executeScenario } from "@ledgerhq/coin-tester/main";
import { closeGenesisClient } from "./genesis";
import { deploySolo, teardownSolo } from "./solo";
import { legacyTarget } from "./helpers";
import { genericTarget } from "./genericHelpers";
import type { HederaBridgeTarget } from "./bridgeTarget";
import { makeScenarioHedera } from "./scenarii/hedera";
import { makeScenarioHederaToken } from "./scenarii/hederaToken";
import { makeScenarioHederaStaking } from "./scenarii/hederaStaking";
import { makeScenarioHederaMultiToken } from "./scenarii/hederaMultiToken";
import { makeScenarioHederaErc20 } from "./scenarii/hederaErc20";
import { makeScenarioHederaErc20Receive } from "./scenarii/hederaErc20Receive";
import { describeNegativeCases } from "./negativeCases";

/** Solo cold start is 7–10 min; the hook gets its own budget so it is not charged to a scenario. */
const CLUSTER_BRING_UP_TIMEOUT_MS = 900_000;

// Per *test*, not per suite: a hung scenario fails in 6 min.
jest.setTimeout(360_000);

["exit", "SIGINT", "SIGQUIT", "SIGTERM", "SIGUSR1", "SIGUSR2", "uncaughtException"].forEach(e =>
  process.on(e, async () => {
    closeGenesisClient();
    await teardownSolo();
  }),
);

/** Runs the full scenario suite against one bridge, `T` fixed for the whole run so every
 * `makeScenarioX(target)` call below builds that bridge's own transaction type. */
function runHederaScenarios<T extends TransactionCommon>(
  label: string,
  target: HederaBridgeTarget<T>,
) {
  describe(`scenarios (${label} bridge)`, () => {
    it("scenario hedera", () => executeScenario(makeScenarioHedera(target)));
    it("scenario hedera token", () => executeScenario(makeScenarioHederaToken(target)));
    it("scenario hedera staking", () => executeScenario(makeScenarioHederaStaking(target)));

    it("scenario hedera token multi", () =>
      executeScenario(makeScenarioHederaMultiToken(target)));
    it("scenario hedera erc20", () => executeScenario(makeScenarioHederaErc20(target)));
    it("scenario hedera erc20 receive", () =>
      executeScenario(makeScenarioHederaErc20Receive(target)));
  });
}

describe("Hedera", () => {
  beforeAll(async () => {
    await deploySolo();
  }, CLUSTER_BRING_UP_TIMEOUT_MS);

  // The three scenarios share one cluster, so no individual scenario may tear it down.
  afterAll(async () => {
    closeGenesisClient();
    await teardownSolo();
  });

  runHederaScenarios("legacy", legacyTarget);
  runHederaScenarios("generic", genericTarget);

  describeNegativeCases();
});
