---
"@ledgerhq/coin-hedera": patch
"@ledgerhq/live-common": patch
---

Validate a Hedera staking node id against the full node set, and expose the delegation mapping as one helper.

`validateIntent` reads every mirror-node page through the new `getAllValidators`, so it accepts the same validators the preloaded list offers the user. `HederaAccount.stakingPositions` is now typed as `StakeWithNodeDetails`, and `@ledgerhq/live-common/families/hedera/delegation` exports `getHederaDelegation`, which maps the account's staking position to a `HederaDelegation` without a cast.
