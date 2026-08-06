---
"@ledgerhq/coin-aleo": patch
---

Fix private transfer amount validation and token transfer parent operations.

- A private transfer, including send-max, could fail with `NotEnoughBalance` even when the selected records covered the amount. Private transfers are now validated against their own records only.
- A token transfer could show two parent operations for the same transaction. Token transfer operations are now matched to stored ones by transaction hash, so no duplicate parent reaches history.
- An incoming token transfer showed the token amount as a credits value on its parent operation. The amount, senders, and recipients are now cleared on that parent.
- A token self-transfer lost the fee from the native history and showed a phantom balance drop on the token account. Its parent operation is now promoted to `FEES`, like any other outgoing token transfer, and the token account now shows a matching outgoing and incoming operation.
- An outgoing token transfer whose sender was private lost the fee from the native history. The parent operation is now promoted from the direction of the token operation, so a hidden sender no longer clears the parent.
- A token self-transfer reported the network fee on both its outgoing and its incoming token operation, on top of the parent `FEES` operation. Only the outgoing side names the fee now; the incoming side reports zero.
- A send-max on a private balance held in a single record reported "amount too large" instead of `NotEnoughBalance`.
- A send-max could exclude a record from the amount without spending it on the fee. The record held back for the fee is now the one the fee transition uses.
- A public send-max on a transparent balance equal to the fee now reports `NotEnoughBalance` instead of building a zero-amount transaction.
- Clearing an incoming token transfer's parent operation no longer drops `extra.programId`, which resolves the token currency on later syncs.
