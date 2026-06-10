---
"@ledgerhq/live-countervalues-react": minor
"@ledgerhq/live-countervalues": minor
"@ledgerhq/coin-kaspa": minor
"@ledgerhq/hw-app-vet": minor
---

Drop the unused `@ledgerhq/cryptoassets` dependency. coin-kaspa and hw-app-vet never imported it. live-countervalues and live-countervalues-react only used it in tests, which now rely on local currency fixtures, removing the dependency from the runtime graph.
