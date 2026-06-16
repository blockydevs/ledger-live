---
"ledger-live-desktop-e2e-tests": minor
"ledger-live-mobile-e2e-tests": minor
---

Use a dynamic minimum sell amount in the buy/sell E2E specs: fetch the live per-currency `maxOfMin` from the sell `cryptoLimitations` API (with a USD-countervalues fallback) instead of hardcoded amounts, so sell flows always clear every provider's threshold. Extract `getAmountFromUSD` into a shared `currencyUtils` helper.
