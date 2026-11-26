---
"@ledgerhq/coin-algorand": minor
"@ledgerhq/live-common": minor
---

Add the Algorand coin framework layer (signer, local api, bridge api, operation extras), kept off the generic bridge allowlist. coin-algorand gives ASA balances and operations their owner, defaults the node and indexer urls, keeps the generic transaction fields through serialization, and shows the opt-in Asset ID from `assetReference`
