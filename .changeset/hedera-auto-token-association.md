---
"@ledgerhq/live-common": patch
---

Populate and persist Hedera auto token association state.

The synced account shape carries `maxAutomaticTokenAssociations` and `isAutoTokenAssociationEnabled`, so `ReceiveWithAssociationModal` no longer walks the user through a real device-signed `TokenAssociate` transaction on accounts where association happens automatically. The Hedera family serialization round-trips this state alongside `stakingPositions`.

Chain-specific account resources reach the synced account through an opaque `fetchAccountResources` hook on the bridge API: the generic coin framework spreads whatever object the hook returns into the account shape without knowing its key or fields, so each family owns both.
