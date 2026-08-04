---
"@ledgerhq/coin-aleo": patch
---

Fix a private send-max and the parent operation of a token transfer.

- A private send-max always failed with `NotEnoughBalance`. The send-max amount comes from the same record selection that the balance check compares it against, so the check could not pass. The record selection is now the authority, and only an amount of zero or less raises the error.
- A native send-max took every record for the amount and left the fee transition without an input. The fee record is now reserved before the amount selection.
- A token transfer showed two parent operations on one transaction hash. Promotion to `FEES` rewrites the operation id, so the next sync rebuilt the same transaction as a `NONE` operation under its original id. One parent per hash is now kept, the promoted one.
- An incoming token transfer showed the token amount as a credits value on its `NONE` parent operation. The amount, senders and recipients are now cleared.
