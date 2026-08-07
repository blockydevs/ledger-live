---
"@ledgerhq/coin-hedera": patch
---

Start the incremental sync cursor one synthetic block earlier.

The cursor was derived from the last known operation's block height plus one. A synthetic block spans several seconds and holds many operations, so that skipped the rest of the block the newest known operation sat in. Operations landing in that same window were lost. Re-covering the block costs nothing, because operation ids deduplicate downstream.
