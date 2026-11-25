import { getCryptoCurrencyById } from "@domain/entity-currency-crypto";
import { LiveConfig, type ConfigSchema } from "@ledgerhq/live-config/LiveConfig";
import { MULTIVERSX_DUMMY_ADDRESS } from "@ledgerhq/coin-multiversx/constants";
import { MULTIVERSX_GENERIC_BRIDGE_KEY, multiversxConfig } from "../families/multiversx/config";
import { nearConfig } from "../families/near/config";
import { stacksConfig } from "../families/stacks/config";
import { createCoinModuleHost } from "../account-data/coin-module/createCoinModuleHost";
import { coinModuleLoaders } from "../coin-modules/loaders";
import { registerCoinModules, resetCoinModulesForTests } from "../coin-modules/registry";
import { clearBridgeCache, getAccountBridgeByFamily, getCurrencyBridge } from ".";

/**
 * Registers `family` alone with its live config for the enclosing suite and returns the setter of its
 * routing key. The bridge is cached per family, so a key only takes effect once the cache is evicted.
 */
function setUpRoutingGate(family: string, key: string, config: ConfigSchema) {
  beforeAll(() => {
    LiveConfig.setConfig(config);
    resetCoinModulesForTests();
    registerCoinModules(coinModuleLoaders.filter(l => l.family === family));
  });

  afterAll(() => {
    LiveConfig.setOverride(key, undefined);
    resetCoinModulesForTests();
    clearBridgeCache();
  });

  return (value: boolean | undefined) => {
    LiveConfig.setOverride(key, value);
    clearBridgeCache(family);
  };
}

const NEAR = getCryptoCurrencyById("near");
const KEY = "config_near_generic_bridge";

// The legacy currency bridge exposes preload/hydrate/getPreloadStrategy; the generic one returns
// scanAccounts alone.
describe("generic coin-framework routing gate", () => {
  const setKey = setUpRoutingGate("near", KEY, nearConfig);

  test("ships defaulting to the legacy bridge, with no override set", async () => {
    setKey(undefined);

    expect(nearConfig[KEY].default).toBe(false);
    expect("preload" in (await getCurrencyBridge(NEAR))).toBe(true);
  });

  test("keeps NEAR on the legacy bridge while the key is off", async () => {
    setKey(false);

    const bridge = await getCurrencyBridge(NEAR);

    expect("preload" in bridge).toBe(true);
  });

  test("routes NEAR through the generic bridge once the key is on", async () => {
    setKey(true);

    const bridge = await getCurrencyBridge(NEAR);

    expect("preload" in bridge).toBe(false);
  });

  test("returns to the legacy bridge when the key is turned back off", async () => {
    setKey(true);
    await getCurrencyBridge(NEAR);

    setKey(false);
    const bridge = await getCurrencyBridge(NEAR);

    expect("preload" in bridge).toBe(true);
  });
});

// Stacks' legacy currency bridge has no preload, so the account bridge tells the routes apart: only
// the generic one carries the token sub-account raw hooks.
describe("generic coin-framework routing gate (Stacks incident recovery)", () => {
  const STACKS_KEY = "config_stacks_generic_bridge";
  const setStacksKey = setUpRoutingGate("stacks", STACKS_KEY, stacksConfig);
  const isGeneric = async () =>
    "assignFromTokenAccountRaw" in (await getAccountBridgeByFamily("stacks"));

  test("ships defaulting to the generic bridge, with no override set", async () => {
    setStacksKey(undefined);

    expect(stacksConfig[STACKS_KEY].default).toBe(true);
    expect(await isGeneric()).toBe(true);
  });

  test("routes Stacks through the generic bridge while the key is on", async () => {
    setStacksKey(true);

    expect(await isGeneric()).toBe(true);
  });

  test("falls back to the legacy bridge once the key is turned off and the cache evicted", async () => {
    setStacksKey(true);
    await getAccountBridgeByFamily("stacks");

    setStacksKey(false);

    expect(await isGeneric()).toBe(false);
  });
});

// MultiversX ships dormant like NEAR did: the legacy currency bridge carries the validators preload,
// the generic one does not.
describe("generic coin-framework routing gate (MultiversX)", () => {
  const ELROND = getCryptoCurrencyById("elrond");
  const setMultiversxKey = setUpRoutingGate(
    "multiversx",
    MULTIVERSX_GENERIC_BRIDGE_KEY,
    multiversxConfig,
  );
  const isGeneric = async () => !("preload" in (await getCurrencyBridge(ELROND)));

  test("ships defaulting to the legacy bridge, with no override set", async () => {
    setMultiversxKey(undefined);

    expect(multiversxConfig[MULTIVERSX_GENERIC_BRIDGE_KEY].default).toBe(false);
    expect(await isGeneric()).toBe(false);
  });

  test("routes MultiversX through the generic bridge once the key is on", async () => {
    setMultiversxKey(true);

    expect(await isGeneric()).toBe(true);
  });

  test("gives the generic account bridge the estimation recipient the legacy one has", async () => {
    setMultiversxKey(true);

    const bridge = await getAccountBridgeByFamily("multiversx");

    expect(bridge.getEstimationRecipient({} as never)).toBe(MULTIVERSX_DUMMY_ADDRESS);
  });

  test("persists the account resources through the generic account bridge", async () => {
    setMultiversxKey(true);

    const bridge = await getAccountBridgeByFamily("multiversx");

    expect(bridge).toEqual(
      expect.objectContaining({
        assignToAccountRaw: expect.any(Function),
        assignFromAccountRaw: expect.any(Function),
      }),
    );
  });

  test("keeps MultiversX accounts on FullSync whatever the key says", () => {
    setMultiversxKey(true);

    expect(createCoinModuleHost().isCurrencySupported(ELROND.id)).toBe(false);
  });

  test("returns to the legacy bridge when the key is turned back off", async () => {
    setMultiversxKey(true);
    await getCurrencyBridge(ELROND);

    setMultiversxKey(false);

    expect(await isGeneric()).toBe(false);
  });
});
