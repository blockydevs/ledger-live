---
"@ledgerhq/live-common": patch
---

Compare the device public key against the seed identifier when verifying a Hedera receive address.

Hedera's device address is the account's public key, while `freshAddress` is the `0.0.x` account id, so the framework's fixed `result.address !== account.freshAddress` check could never succeed and verify-address threw `WrongDeviceForAccount` for every Hedera account. The generic account bridge now takes an optional per-family address matcher; the default keeps the existing comparison for every other family.
