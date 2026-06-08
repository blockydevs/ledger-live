---
"@ledgerhq/coin-stellar": minor
---

fix(coin-stellar): stop using filtered op count to terminate pagination — use Horizon page size instead, so unsupported op types no longer truncate history
