import { LiveConfig } from "@ledgerhq/live-config/LiveConfig";
import { algorandConfig } from "../../families/algorand/config";
import { getCoinFrameworkAccountBridge } from "./accountBridge";
import { getCoinFrameworkCurrencyBridge } from "./currencyBridge";
import { isGenericCoinFrameworkFamily } from "./genericCoinFrameworkFamilies";
import { coinModuleLoaders } from "../../coin-modules/loaders";

describe("Algorand coin framework layer", () => {
  const loader = coinModuleLoaders.find(({ family }) => family === "algorand");

  it.each(["loadLocalApi", "loadSigner", "loadBridgeApi", "loadAccountRawAssign"] as const)(
    "registers %s",
    key => {
      expect(loader?.[key]).toEqual(expect.any(Function));
    },
  );

  it("builds the account and currency bridges", async () => {
    await expect(getCoinFrameworkAccountBridge("algorand", "local")).resolves.toBeDefined();
    await expect(getCoinFrameworkCurrencyBridge("algorand", "local")).resolves.toBeDefined();
  });

  it("stays off the generic coin framework", () => {
    expect(isGenericCoinFrameworkFamily("algorand")).toBe(false);
  });

  it("has a node and an indexer in its default configuration", () => {
    LiveConfig.setConfig(algorandConfig);
    const config = LiveConfig.getValueByKey("config_currency_algorand");

    expect(config.node).toEqual(expect.stringMatching(/^https:\/\//));
    expect(config.indexer).toEqual(expect.stringMatching(/^https:\/\//));
  });
});
