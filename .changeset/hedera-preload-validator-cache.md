---
"@ledgerhq/coin-hedera": patch
"@ledgerhq/live-common": patch
---

Cache the Hedera validator preload for 15 minutes and drop the dead hydrate path.

The generic coin framework exposes no currency-level hydrate hook, so every mount of a validator-consuming hook re-walked the whole paginated mirror-node listing. `preload()` now caches per currency and publishes into the shared store itself. Removes `HederaValidatorRaw` and the raw-to-validator mapping it fed.
