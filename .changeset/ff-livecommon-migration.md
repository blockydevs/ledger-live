---
"@ledgerhq/live-common": minor
"@shared/feature-flags": minor
"@features/platform-feature-flags": minor
---

Migrate `@ledgerhq/live-common`'s internal feature-flag consumers off its React `featureFlags` Context module and `@ledgerhq/types-live` feature types, onto the Redux-backed `@shared/feature-flags` / `@features/platform-feature-flags` packages. Adds the platform-specific `formatToFirebaseFeatureId` / `formatDefaultFeatures` to `@features/platform-feature-flags` and the generic `isValidFeatureId` to `@shared/feature-flags`. No behavioral change — resolved flag values are identical.
