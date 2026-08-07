---
"@ledgerhq/coin-hedera": patch
---

Keep the staking-reward suffix on a reward operation's hash.

A `REWARD` operation shares its consensus timestamp and hash with the transaction that
triggered the payout. `STAKING_REWARD_HASH_SUFFIX` is what keeps the two apart, and the
generic framework groups operations by hash to build parent operations. Stripping the suffix
made a reward collide with an unrelated transaction from the same second, and one of the two
was dropped from the account.
