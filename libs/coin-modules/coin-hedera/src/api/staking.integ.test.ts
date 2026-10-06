import { getEnv } from "@ledgerhq/live-env";
import { createApi } from "../api";
import { rpcClient } from "../network/rpc";
import { MAINNET_TEST_ACCOUNTS } from "../test/fixtures/account.fixture";
import { getMockedConfig, getMockedContext } from "../test/fixtures/config.fixture";

describe("createApi", () => {
  const apiConfig = {
    ...getMockedConfig(),
    useNetworkTimestamp: true,
    apiUrls: {
      mirrorNode: getEnv("API_HEDERA_MIRROR"),
      hgraph: getEnv("API_HEDERA_HGRAPH"),
    },
  };
  const api = createApi("hedera");
  const context = getMockedContext(apiConfig);

  afterAll(async () => {
    await rpcClient._resetInstance();
  });

  describe("getValidators", () => {
    it("returns validators with APY information", async () => {
      const result = await api.getValidators(context);

      expect(result.items.length).toBeGreaterThan(0);
      result.items.forEach(item => {
        expect(item).toMatchObject({
          address: expect.any(String),
          id: expect.any(String),
          name: expect.any(String),
          description: expect.any(String),
          balance: expect.any(BigInt),
          apy: expect.any(Number),
        });
        expect(item.apy).toBeGreaterThanOrEqual(0);
        expect(item.apy).toBeLessThanOrEqual(1);
      });
    });
  });

  describe("getStakes", () => {
    it("returns empty stakes for pristine account", async () => {
      const stakes = await api.getStakes(context, MAINNET_TEST_ACCOUNTS.pristine.accountId);

      expect(stakes.items.length).toBe(0);
    });

    it("returns stake for delegated account", async () => {
      const stakes = await api.getStakes(context, MAINNET_TEST_ACCOUNTS.activeStaking.accountId);

      expect(stakes.items.length).toBeGreaterThan(0);
    });
  });

  describe("getRewards", () => {
    it("returns empty rewards for pristine account", async () => {
      const rewards = await api.getRewards(context, MAINNET_TEST_ACCOUNTS.pristine.accountId);

      expect(rewards.items.length).toBe(0);
    });

    it("returns rewards for delegated account", async () => {
      const rewards = await api.getRewards(context, MAINNET_TEST_ACCOUNTS.activeStaking.accountId);

      expect(rewards.items.length).toBeGreaterThan(0);
    });
  });
});
