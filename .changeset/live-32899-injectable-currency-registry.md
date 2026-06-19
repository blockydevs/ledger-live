---
"@ledgerhq/cryptoassets": minor
---

Make the crypto-currency registry injectable via a service-locator with graceful fallback.

A new `setCryptoCurrenciesStore(store)` lets the host application supply the currency registry data (the by-id map, the by-ticker/by-scheme indices and the dev/terminated currency arrays) through the `CryptoCurrenciesStore` port. All registry accessors — `getCryptoCurrencyById`, `findCryptoCurrencyById`, `findCryptoCurrencyByTicker`, `findCryptoCurrencyByScheme`, `findCryptoCurrencyByKeyword`, `findCryptoCurrencyByManagerAppName`, `findCryptoCurrency`, `hasCryptoCurrencyId` and `listCryptoCurrencies` — now read from the injected store when present, falling back to the bundled data otherwise.

This is purely additive: with no store injected the behaviour is identical to before (the bundled registry), so external consumers and existing call sites are unaffected. The fallback never throws, so accessors invoked at module-evaluation time stay safe.
