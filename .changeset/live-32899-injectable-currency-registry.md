---
"@ledgerhq/cryptoassets": minor
---

Make the crypto-currency registry injectable via a service-locator with graceful fallback.

A new `setCryptoCurrenciesStore(currencies)` lets the host application supply the canonical `CryptoCurrency[]`; the by-id/ticker/scheme indices and the dev/terminated arrays are derived internally, so they stay consistent by construction and the derived shape is not part of the public interface. All registry accessors — `getCryptoCurrencyById`, `findCryptoCurrencyById`, `findCryptoCurrencyByTicker`, `findCryptoCurrencyByScheme`, `findCryptoCurrencyByKeyword`, `findCryptoCurrencyByManagerAppName`, `findCryptoCurrency`, `hasCryptoCurrencyId` and `listCryptoCurrencies` — now read from the injected store when present, falling back to the bundled data otherwise.

This is purely additive: with no store injected the behaviour is identical to before (the bundled registry), so external consumers and existing call sites are unaffected. The fallback never throws, so accessors invoked at module-evaluation time stay safe.
