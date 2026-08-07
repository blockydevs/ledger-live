---
"@ledgerhq/live-common": patch
---

Build the Hedera device confirmation fields from `GenericTransaction`.

The device field list read `properties.stakingNodeId`, `memo` and `gasLimit` — fields of the package-local transaction type. The runtime object carries `valId`, `memoValue` and `gasLimit`, so the Memo, Staked Node ID and Gas Limit rows never rendered. The memo is written into the signed payload, so the confirmation screen the user cross-checks against the device was missing a signed field.
