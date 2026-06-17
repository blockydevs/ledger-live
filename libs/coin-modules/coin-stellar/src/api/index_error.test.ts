import type { CoinModuleApi } from "@ledgerhq/coin-module-framework/api/index";
import nock from "nock";
import { StellarMemo } from "../types";
import { createApi } from ".";
describe("Stellar Api", () => {
  let module: CoinModuleApi<StellarMemo>;
  const ADDRESS = "GBAUZBDXMVV7HII4JWBGFMLVKVJ6OLQAKOCGXM5E2FM4TAZB6C7JO2L7";

  // The 429-retry path sleeps on a real 4s setTimeout (logic/operationsFromHeight.ts),
  // which races Jest's 5s default timeout and flakes CI. Fire timer callbacks
  // synchronously so the retry happens with zero real delay.
  let setTimeoutSpy: jest.SpyInstance;
  beforeEach(() => {
    setTimeoutSpy = jest.spyOn(global, "setTimeout").mockImplementation((fn: TimerHandler) => {
      if (typeof fn === "function") (fn as () => void)();
      return 0 as unknown as NodeJS.Timeout;
    });
  });
  afterEach(() => {
    setTimeoutSpy.mockRestore();
  });

  beforeAll(() => {
    nock("https://horizon-testnet.stellar.org")
      .get(/.*/)
      .reply(() => {
        return [429, { error: "whatever, only status code is important" }];
      })
      .get(/.*/)
      .reply(() => {
        return [200, { _links: {}, _embedded: { records: [] } }];
      });

    module = createApi({
      explorer: {
        url: "https://horizon-testnet.stellar.org/",
      },
    });
  });

  describe("listOperations can handle 429 errors", () => {
    it("retrieved operations", async () => {
      const { items: txs } = await module.listOperations(ADDRESS, { minHeight: 0, order: "asc" });
      expect(txs.length).toBe(0);
    });
  });
});
