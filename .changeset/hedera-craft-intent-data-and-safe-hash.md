---
"@ledgerhq/coin-hedera": patch
---

Craft the Hedera staking and ERC20 intent data, and emit url-safe operation hashes.

`api/index.ts` exported the framework's default `craftTransactionData`, which always returns `{type:"none"}`. Staking intents therefore never carried a node id, so delegate and redelegate failed validation and undelegate charged a fee without clearing the stake; ERC20 transfers always fell back to the default gas limit. `estimateFees` now returns the estimated gas in its `parameters`, which `craftTransaction` reads via the `customFees` argument to size the ERC20 transaction's gas limit.

Broadcast returned plain base64 and operations synced with `useEncodedHash: false`. A 48-byte SHA-384 hash is 64 base64 characters, so most contain `+` or `/`, which the Hashscan explorer URL does not escape. Both sides now use the url-safe encoding and stay consistent with each other.
