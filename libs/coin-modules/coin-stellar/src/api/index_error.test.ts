import type { CoinModuleApi } from "@ledgerhq/coin-module-framework/api/index";
import nock from "nock";
import { StellarMemo } from "../types";
import { createApi } from ".";
describe("Stellar Api", () => {
  let module: CoinModuleApi<StellarMemo>;
  const ADDRESS = "GBAUZBDXMVV7HII4JWBGFMLVKVJ6OLQAKOCGXM5E2FM4TAZB6C7JO2L7";

  // The 429-retry path sleeps on a real 4s setTimeout (logic/operationsFromHeight.ts),
  // which races Jest's 5s default timeout and flakes CI. Forward setTimeout to the real
  // timer with a 0ms delay: this removes the wall-clock wait while keeping the callback
  // on a future tick, so retry ordering/recursion match production (unlike a synchronous
  // stub, which would turn the scheduled retry into immediate in-stack recursion).
  const realSetTimeout = global.setTimeout;
  let setTimeoutSpy: jest.SpyInstance;
  beforeEach(() => {
    setTimeoutSpy = jest
      .spyOn(global, "setTimeout")
      .mockImplementation(((fn: TimerHandler, _ms?: number, ...args: unknown[]) =>
        realSetTimeout(fn, 0, ...args)) as typeof setTimeout);
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
