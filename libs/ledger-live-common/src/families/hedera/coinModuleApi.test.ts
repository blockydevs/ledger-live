import { LiveConfig } from "@ledgerhq/live-config/LiveConfig";
import { createLocalHederaApi } from "./coinModuleApi";

describe("createLocalHederaApi", () => {
  beforeAll(() => {
    // createLocalHederaApi reads its config off LiveConfig; outside the app's runtime
    // bootstrap (which loads it from the remote config provider), it stays unset.
    jest.spyOn(LiveConfig, "getValueByKey").mockReturnValue({
      networkType: "mainnet",
      useNetworkTimestamp: true,
      apiUrls: { mirrorNode: "", hgraph: "" },
    });
  });

  it("returns an object exposing the CoinModuleApi surface", () => {
    const api = createLocalHederaApi("hedera");

    expect(typeof api.craftTransaction).toBe("function");
    expect(typeof api.validateIntent).toBe("function");
    expect(typeof api.getStakes).toBe("function");
  });
});
