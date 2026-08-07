---
"@ledgerhq/live-common": patch
---

Attach the memo to the Hedera optimistic operation.

`enrichOptimisticOperation` did not copy `memoValue` into `operation.extra`, and the base operation the generic framework builds carries no memo. Operation details read `extra.memo`, so the Memo row was hidden from the moment the device confirmed the transaction until the next sync replaced the pending operation with the indexed one. Send, token send and staking operations now carry the memo straight away, matching the synced operation.
