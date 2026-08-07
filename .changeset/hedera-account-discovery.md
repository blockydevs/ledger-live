---
"@ledgerhq/live-common": patch
---

Discover Hedera accounts by public key through the mirror node.

The generic currency bridge supplied no `buildIterateResult`, so account discovery used the derivation-based default and scanned with the device public key instead of a `0.0.x` account id — throwing on the first index and leaving the 255-index loop unbounded. The bridge now accepts a per-network builder, loaded on demand; Hedera resolves account ids through `getAccountsForPublicKey` and stops as soon as the mirror node's list is exhausted.
