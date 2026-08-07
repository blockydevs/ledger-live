---
"@ledgerhq/coin-hedera": patch
---

Fetch newer transactions when an incremental sync synthesizes its cursor.

`getPaginationDirection` maps a `desc` order to a `lt:` timestamp bound. The generic
framework never supplies a real paging token, so `listOperations` synthesized a cursor from
`minHeight` and then asked the mirror node for transactions *older* than it. A transaction
that had just been broadcast could never appear, so the account's operation list stopped
growing after every send.

A synthesized catch-up cursor now fetches ascending, which resolves the bound to `gt:`. The
returned operations are still sorted into the caller's requested order, so display ordering
is unchanged.
