---
"@ledgerhq/live-common": minor
"ledger-live-desktop": minor
"live-mobile": minor
---

Use the dedicated CVS `tokenized-stock` category for the Market stocks filter instead of the hardcoded `filter=stock` + client-side id matching, and stop firing a spurious `to=usd` market request while the supported counter-values list is still loading.
