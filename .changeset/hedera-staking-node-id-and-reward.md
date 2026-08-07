---
"@ledgerhq/coin-hedera": patch
"ledger-live-desktop": patch
"live-mobile": patch
---

Populate the Hedera staked node id and stop double-counting pending rewards.

`getBalance` set `details: { overstaked }` and never `stakedNodeId`, so every staking screen resolved an undefined validator. The stake shape now mirrors `getStakes`, including the `active`/`inactive` state and a `delegate` only when a node is resolved. The six screens that label a figure "delegated" now read `stake.amountDeposited` instead of `stake.amount`, which also carries the pending reward already shown on its own line.
