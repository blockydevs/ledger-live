---
"@ledgerhq/live-common": minor
"@ledgerhq/live-signer-hedera": minor
"@ledgerhq/types-live": minor
---

Hedera can sign through the Device Management Kit signer kit, behind the `ldmkHederaSigner` remote flag. The flag ships off, so `hw-app-hedera` stays the default signing path. Both paths sign with identical APDU bytes and derive the same seed identifier, though the public-key read APDU differs in payload length. The signer kit is vendored as a tarball pending its registry release.
