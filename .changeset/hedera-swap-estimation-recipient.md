---
"@ledgerhq/live-common": patch
---

Register a swap estimation recipient for Hedera.

Hedera registered no `loadBridgeExtensions`, so `defaultBridgeExtensions` threw `no estimation recipient for currency hedera` and every HBAR swap quote failed before a quote could be fetched.
