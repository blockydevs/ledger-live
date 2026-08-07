---
"@ledgerhq/live-common": patch
---

Restore the Hedera legacy bridge fallback in `genericCoinFrameworkFamilies.json`.

Setting the Hedera flag to `false` threw `CurrencyNotSupported`, because `families/hedera/setup.ts` no longer exported a `bridge`. It now wraps `coin-hedera/src/bridge` behind `createLegacyCompatBridges`, which translates transactions across the generic and legacy shapes at each bridge method, keeps `assignToAccountRaw`/`assignFromAccountRaw` on the generic serialization, and derives `stakingPositions` from `hederaResources.delegation` on every sync and on account discovery, so the delegation card, rewards, and footer balance render the same numbers under either bridge and clear correctly after an undelegate.

The fallback is not a full parity path. Under the legacy bridge: `signRawOperation` throws; a staking transaction's device summary shows an extra Memo row; and claiming rewards shows a 1-tinybar amount with a rewritten recipient, both requirements of how the legacy Hedera SDK builds those transactions on-device.
