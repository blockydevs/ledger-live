import type { CryptoCurrency } from "@ledgerhq/types-cryptoassets";

/**
 * Injectable source of crypto-currency registry *data*.
 *
 * The lookup algorithms (by id/ticker/scheme/keyword/manager-app, predicate search and the
 * dev/terminated filtering of `listCryptoCurrencies`) live in `currencies.ts` and run over
 * whichever store is active. A store therefore only needs to provide the indexed data — the
 * by-id map, the two indices and the four arrays — mirroring the bundled structures.
 */
export type CryptoCurrenciesStore = {
  cryptocurrenciesById: Record<string, CryptoCurrency>;
  cryptocurrenciesByScheme: Record<string, CryptoCurrency>;
  cryptocurrenciesByTicker: Record<string, CryptoCurrency>;
  /** All currencies (dev + prod), terminated included. */
  cryptocurrenciesArray: CryptoCurrency[];
  /** Prod-only currencies, terminated included. */
  prodCryptoArray: CryptoCurrency[];
  /** All currencies (dev + prod), terminated excluded. */
  cryptocurrenciesArrayWithoutTerminated: CryptoCurrency[];
  /** Prod-only currencies, terminated excluded. */
  prodCryptoArrayWithoutTerminated: CryptoCurrency[];
};

declare global {
  interface GlobalThis {
    __ledgerCryptoCurrenciesStore?: CryptoCurrenciesStore;
  }
}

/**
 * Injects the crypto-currency registry store.
 * This should be called once during application initialization.
 *
 * Uses globalThis to ensure a single shared reference across all module instances,
 * which is critical when coin-modules are lazy-loaded and may resolve to separate
 * module copies.
 */
export function setCryptoCurrenciesStore(store: CryptoCurrenciesStore): void {
  globalThis.__ledgerCryptoCurrenciesStore = store;
}

/**
 * Returns the injected crypto-currency registry store, or `undefined` when none has been set.
 *
 * Unlike `getCryptoAssetsStore`, this never throws: callers fall back to the bundled data,
 * so accessors invoked at module-evaluation time (before any injection) stay safe.
 */
export function getInjectedCurrenciesStore(): CryptoCurrenciesStore | undefined {
  return globalThis.__ledgerCryptoCurrenciesStore;
}
