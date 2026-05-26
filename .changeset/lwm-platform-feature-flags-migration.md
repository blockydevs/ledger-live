---
"live-mobile": minor
---

Migrate all in-app feature-flag hook imports to `@features/platform-feature-flags` (Redux-backed) and decouple from `@ledgerhq/live-common/featureFlags/*` + `@ledgerhq/types-live` for feature-flag types/constants.

Touches ~230 LLM files across hooks, constants, and types:
- `useFeature`, `useFeatureFlags`, `useHasLocallyOverriddenFeatureFlags`, `useWalletFeaturesConfig`, `FeatureToggle` now imported from `@features/platform-feature-flags`.
- 7 imperative `useFeatureFlags()` destructuring sites (FeatureFlagsSettings, Wallet40 debug, RecoverUpsellRow, ProductTour debug) rewritten with `useDispatch` + `setOverride` / `setAllOverrides` from `@shared/feature-flags`; `isFeature` runtime narrow replaced with `FeatureIdSchema.safeParse`.
- `DEFAULT_FEATURES` → `FEATURE_FLAGS_DEFAULTS` (renamed in `@shared/feature-flags`); `groupedFeatures` / `GroupedFeature` source swap.
- `Feature` / `FeatureId` / `Features` type imports moved from `@ledgerhq/types-live` to `@shared/feature-flags`. `Feature_*` named aliases (`Feature_StakePrograms`, `Feature_LlmMmkvMigration`, `Feature_BrazePushNotifications`, `Feature_LwmNewWordingOptInNotificationsDrawer`, `Feature_EthStakingProviders`) replaced with `Features["key"]` indexed access.
- `__tests__/test-renderer.tsx` `withFlagOverrides` now also populates `featureFlags.resolved` so hooks see overrides without an action dispatch.
- 4 `jest.mock` targets retargeted from live-common's path to `@features/platform-feature-flags`.
- New `.eslintrc.guardrails.js` + `lint:guardrails` script blocks re-introduction of migrated symbols from `@ledgerhq/live-common/featureFlags`.

Held back on live-common with a documented reason:
- `FirebaseFeatureFlags.tsx` (deleted by LIVE-30413).
- `__tests__/featureFlags.ts` (feeds `FirebaseFeatureFlagsProvider`; LIVE-30413).
- `analytics/segment.ts` (same).
- `useVersionedStakePrograms.ts` (`Feature_StakePrograms` cast tagged `TODO(LIVE-31326)` — types-live's `Redirect<M>.queryParams` brand contradicts real Firebase data).

Depends on LIVE-30360 (package merged via #17239) and LIVE-31275 (`fetchRemoteFlags` wired into middleware via #17749).
