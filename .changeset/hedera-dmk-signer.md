---
"@ledgerhq/live-common": minor
"@ledgerhq/live-signer-hedera": minor
---

Hedera now signs through the Device Management Kit signer kit instead of `hw-app-hedera`. The device wire format is unchanged, so existing accounts keep the same seed identifier. The signer kit is vendored as a tarball pending its registry release.
