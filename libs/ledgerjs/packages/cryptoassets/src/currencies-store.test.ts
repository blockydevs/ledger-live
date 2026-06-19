import type { CryptoCurrency } from "@ledgerhq/types-cryptoassets";
import {
  listCryptoCurrencies,
  hasCryptoCurrencyId,
  getCryptoCurrencyById,
  findCryptoCurrency,
  findCryptoCurrencyById,
  findCryptoCurrencyByScheme,
  findCryptoCurrencyByTicker,
  findCryptoCurrencyByKeyword,
  findCryptoCurrencyByManagerAppName,
} from "./currencies";
import {
  CryptoCurrenciesStore,
  getInjectedCurrenciesStore,
  setCryptoCurrenciesStore,
} from "./currencies-store";

const makeCurrency = (id: string): CryptoCurrency =>
  ({
    id,
    name: `${id} name`,
    ticker: id.toUpperCase(),
    scheme: id,
    managerAppName: `${id} App`,
    keywords: [`${id}-kw`],
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  }) as unknown as CryptoCurrency;

// One sentinel per list bucket so we can assert listCryptoCurrencies selects the right array.
const prodActive = makeCurrency("inj_prod_active");
const devActive = makeCurrency("inj_dev_active");
const prodTerminated = makeCurrency("inj_prod_terminated");
const devTerminated = makeCurrency("inj_dev_terminated");

const injectedStore: CryptoCurrenciesStore = {
  cryptocurrenciesById: {
    [prodActive.id]: prodActive,
    [devActive.id]: devActive,
    [prodTerminated.id]: prodTerminated,
    [devTerminated.id]: devTerminated,
  },
  cryptocurrenciesByScheme: { [prodActive.scheme]: prodActive },
  cryptocurrenciesByTicker: { [prodActive.ticker]: prodActive },
  prodCryptoArrayWithoutTerminated: [prodActive],
  cryptocurrenciesArrayWithoutTerminated: [prodActive, devActive],
  prodCryptoArray: [prodActive, prodTerminated],
  cryptocurrenciesArray: [prodActive, devActive, prodTerminated, devTerminated],
};

function clearInjectedStore() {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  (globalThis as Record<string, unknown>).__ledgerCryptoCurrenciesStore = undefined;
}

describe("currencies-store: no store injected (bundled fallback)", () => {
  afterEach(clearInjectedStore);

  it("getInjectedCurrenciesStore returns undefined and never throws", () => {
    expect(getInjectedCurrenciesStore()).toBeUndefined();
  });

  it("accessors resolve against the bundled registry", () => {
    expect(getCryptoCurrencyById("bitcoin")).toMatchObject({ id: "bitcoin" });
    expect(hasCryptoCurrencyId("bitcoin")).toBe(true);
    // The injected sentinels are absent from the bundled data.
    expect(findCryptoCurrencyById(prodActive.id)).toBeUndefined();
  });
});

describe("currencies-store: store injected", () => {
  beforeEach(() => setCryptoCurrenciesStore(injectedStore));
  afterEach(clearInjectedStore);

  it("reads the injected registry and ignores bundled data", () => {
    expect(getInjectedCurrenciesStore()).toBe(injectedStore);
    expect(getCryptoCurrencyById(prodActive.id)).toBe(prodActive);
    expect(findCryptoCurrencyById(prodActive.id)).toBe(prodActive);
    // bitcoin is bundled-only — now invisible.
    expect(findCryptoCurrencyById("bitcoin")).toBeUndefined();
    expect(() => getCryptoCurrencyById("bitcoin")).toThrow('currency with id "bitcoin" not found');
  });

  it("routes hasCryptoCurrencyId through the injected map", () => {
    expect(hasCryptoCurrencyId(prodActive.id)).toBe(true);
    expect(hasCryptoCurrencyId("bitcoin")).toBe(false);
  });

  it("routes ticker / scheme / predicate lookups", () => {
    expect(findCryptoCurrencyByTicker(prodActive.ticker)).toBe(prodActive);
    expect(findCryptoCurrencyByScheme(prodActive.scheme)).toBe(prodActive);
    expect(findCryptoCurrency(c => c.id === devTerminated.id)).toBe(devTerminated);
  });

  it("routes keyword and manager-app lookups (which compose the leaf accessors)", () => {
    expect(findCryptoCurrencyByKeyword("inj_prod_active-kw")).toBe(prodActive);
    expect(findCryptoCurrencyByManagerAppName(prodActive.managerAppName)).toBe(prodActive);
  });

  it("listCryptoCurrencies selects the correct bucket per (withDevCrypto, withTerminated)", () => {
    expect(listCryptoCurrencies()).toEqual([prodActive]);
    expect(listCryptoCurrencies(true)).toEqual([prodActive, devActive]);
    expect(listCryptoCurrencies(false, true)).toEqual([prodActive, prodTerminated]);
    expect(listCryptoCurrencies(true, true)).toEqual([
      prodActive,
      devActive,
      prodTerminated,
      devTerminated,
    ]);
  });

  it("restores bundled fallback once cleared", () => {
    clearInjectedStore();
    expect(getCryptoCurrencyById("bitcoin")).toMatchObject({ id: "bitcoin" });
  });
});
