import { createRandomWallet, GENESIS_BALANCE_LOOP } from "./fixtures";
import { killGoloop, spawnGoloop } from "./goloop";
import { rpc } from "./helpers";

global.console = require("console");
jest.setTimeout(600_000);

["exit", "SIGINT", "SIGQUIT", "SIGTERM", "SIGUSR1", "SIGUSR2", "uncaughtException"].forEach(e =>
  process.on(e, async () => {
    await killGoloop();
  }),
);

// Infra-sanity tier: no signer, no msw indexer, no transactions. It only
// proves the devnet itself is live and matches the genesis entrypoint.ts
// promises money-movement scenarios build on.
describe("SODAX devnet infra", () => {
  const devAddress = createRandomWallet().getAddress();

  beforeAll(async () => {
    process.env.DEV_ADDRESS = devAddress;
    await spawnGoloop();
  });

  afterAll(async () => {
    await killGoloop();
  });

  it("advances block height across two polls", async () => {
    const first = await rpc.getLastBlock().execute();
    await new Promise(resolve => setTimeout(resolve, 3_000));
    const second = await rpc.getLastBlock().execute();
    expect(second.height).toBeGreaterThan(first.height);
  });

  it("resolves the pre-funded genesis dev account", async () => {
    const balance = await rpc.getBalance(devAddress).execute();
    expect(balance.toFixed()).toBe(GENESIS_BALANCE_LOOP.toFixed());
  });
});
