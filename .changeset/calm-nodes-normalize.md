---
"@ledgerhq/coin-hedera": patch
---

Mirror node fields that can be null are typed as nullable and handled where they are read. A mirror node response without its top-level list throws `HederaMirrorNodeResponseError`.
