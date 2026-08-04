---
"@ledgerhq/coin-aleo": patch
---

Fix private transfer balance validation and the parent operation of a token transfer.

- A private transfer, including send-max, could fail with `NotEnoughBalance` even when the selected records covered the amount. The check compared the amount against a balance drawn from a capped record selection, while the fee is paid from a separate record outside that selection. Private transfers are now validated against their own records only; `validatePrivateTransaction` and `validatePrivateFeeRecord` already cover the amount and the fee.
- A token transfer showed two parent operations on one transaction hash. Promotion to `FEES` rewrites the operation id, so the next sync re-fetched the same transaction as a `NONE` operation under its original id and kept both. Freshly fetched operations are now matched to stored ones by transaction hash, so the duplicate never reaches history.
- An incoming token transfer showed the token amount as a credits value on its `NONE` parent operation. The amount, senders and recipients are now cleared.
- A token self-transfer lost the fee from the native history. Its parent operation was cleared like a genuine incoming transfer instead of being promoted to `FEES`.
