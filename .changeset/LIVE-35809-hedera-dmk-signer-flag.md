---
"@ledgerhq/live-common": minor
"@ledgerhq/live-signer-hedera": minor
"@ledgerhq/types-live": minor
---

Hedera can sign through the Device Management Kit signer kit, behind the `ldmkHederaSigner` remote flag. The flag ships off, so `hw-app-hedera` stays the default signing path. The device wire format is unchanged on both paths, so existing accounts keep the same seed identifier. The signer kit is vendored as a tarball pending its registry release.
