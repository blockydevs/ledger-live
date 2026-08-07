---
"@ledgerhq/live-common": patch
---

Give Hedera transactions a zero nonce so `signOperation` skips `getNextSequence`.

Hedera has no account sequence and `coin-hedera`'s `getNextSequence` throws, so every signature died before reaching the device. `utils.ts` maps `nonce` to `intent.sequence`, which lets `signOperation` take the short path.
