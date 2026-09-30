---
"@ledgerhq/coin-aleo": patch
---

Fix send-max validation and token transfer parent operations.

- Validate a private transfer against its own records only.
- Report `NotEnoughBalance` for a public send-max when the balance only covers the fee.
- Match token transfer operations by transaction hash, so each transaction has one parent operation.
- Promote the parent of an outgoing or self token transfer to `FEES`, and report the fee only on the outgoing token operation.
- Clear the amount, senders and recipients on an incoming token transfer's parent, and keep `extra.programId`.
