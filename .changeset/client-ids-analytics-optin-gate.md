---
"@ledgerhq/client-ids": minor
"ledger-live-desktop": minor
"live-mobile": minor
---

Gate the device-ids push middleware behind the `analyticsOptIn` feature flag in addition to the user analytics consent. Device IDs are now only sent to `/v2/pushdevices` when the FF is enabled AND the user has opted in.
