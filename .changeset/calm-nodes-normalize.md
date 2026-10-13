---
"@ledgerhq/coin-hedera": minor
---

Normalize Hedera mirror node responses at the network layer: missing required data throws HederaMirrorNodeResponseError, incomplete list items are skipped and logged. `maxAutomaticTokenAssociations` is now `0` instead of `null` for accounts where the mirror node returns null (pre-HIP-23 accounts).
