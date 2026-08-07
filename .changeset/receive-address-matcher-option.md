---
"@ledgerhq/ledger-wallet-framework": patch
"@ledgerhq/live-common": patch
---

Accept an optional address matcher in `makeAccountBridgeReceive`.

`makeAccountBridgeReceive` takes a `receiveAddressMatcher` option, typed as the new exported `ReceiveAddressMatcher`, which decides whether a device `getAddress` result belongs to the account and which address to surface. Without it, receive keeps comparing the result address against `account.freshAddress`. The generic coin framework's account bridge uses the option to apply the family's `BridgeApi.receiveAddressMatcher` hook, and falls back to the default comparison when the family declares no hook or its bridge api fails to load.
