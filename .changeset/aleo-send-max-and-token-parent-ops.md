---
"@ledgerhq/coin-aleo": patch
---

Fix private transfer amount validation and token transfer parent operations.

- A private transfer, including send-max, could fail with `NotEnoughBalance` even when the selected records covered the amount. Private transfers are now validated against their own records only.
- A token transfer could show two parent operations for the same transaction. Token transfer operations are now matched to stored ones by transaction hash, so no duplicate parent reaches history.
- An incoming token transfer showed the token amount as a credits value on its parent operation. The amount, senders, and recipients are now cleared on that parent.
- A token self-transfer lost the fee from the native history and showed a phantom balance drop on the token account. Its parent operation is now promoted to `FEES`, like any other outgoing token transfer, and the token account now shows a matching outgoing and incoming operation, so its balance history stays flat across the self-transfer.
