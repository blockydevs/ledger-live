---
"live-mobile": minor
---

Add a persisted `homeScreenConfig` Redux slice holding the market banner filter (`marketBannerFilter`). Exposes `setMarketBannerFilter` and `selectMarketBannerFilter`, defaults to `"trending"`, and survives app restart via MMKV.
