---
"@ledgerhq/coin-hedera": patch
---

Fall back to the default gas estimate when an ERC20 transfer address does not resolve.

The contract-call fee estimate threw when the mirror node had no EVM address for the sender or the recipient. Every status build runs fee estimation first, so the throw pre-empted the layers that own the error: `getTransactionStatus` never reported `InvalidAddress`, and `craftTransaction` never reported the missing EVM address. The estimate now degrades to the default gas values, the same fallback it already used when live gas estimation failed, and never returns a zero fee.
