---
"@ledgerhq/live-common": minor
"@ledgerhq/coin-modules-monitoring": minor
"@ledgerhq/coin-tester-evm": minor
"@ledgerhq/coin-tester-tezos": minor
"@ledgerhq/coin-tester-solana": minor
---

Drop the `.js` extension from relative dynamic `import()` specifiers in live-common (coin module loaders and the generic coin framework bridge/api). Switch the remaining NodeNext consumers that read live-common source to `moduleResolution: "bundler"` so extensionless imports resolve in the IDE, while keeping their CommonJS build output unchanged.
