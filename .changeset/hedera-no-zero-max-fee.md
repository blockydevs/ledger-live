---
"@ledgerhq/coin-hedera": patch
---

Surface an address-resolution failure instead of signing a zero max fee.

`toEVMAddress` swallows its errors and returns `null`. The contract-call estimate returned `BigNumber(0)` untouched when an address failed to resolve, and the `if (transaction.maxFee)` guard treats that object as truthy, so `setMaxTransactionFee(0)` was signed and the transfer failed on chain with `INSUFFICIENT_TX_FEE` with nothing to explain it. The estimate now throws naming the address that failed, and the guard requires a positive fee.
