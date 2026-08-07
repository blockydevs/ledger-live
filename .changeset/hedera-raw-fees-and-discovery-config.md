---
"@ledgerhq/live-common": patch
---

Fix two Hedera regressions on the generic bridge path.

A transaction with `fees: null` lost that field through `toTransactionRaw`/`fromTransactionRaw`, because both sides tested truthiness and could not tell `null` from absent. Account discovery resolved its network config through the coin module's own config store, which only the legacy bridge populates, so `scanAccounts` threw `MissingCoinConfig`; it now reads the currency configuration the rest of the generic path uses.
