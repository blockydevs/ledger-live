import { createApi } from ".";
import { type CardanoConfig } from "../config";

const config: CardanoConfig = { maxFeesWarning: 0, maxFeesError: 0 };

describe("lastBlock", () => {
  it("throws an unsupported error", () => {
    const api = createApi(config, "cardano");

    expect(() => api.lastBlock()).toThrow("lastBlock is not supported");
  });
});
