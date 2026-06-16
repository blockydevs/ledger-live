---
"live-mobile": minor
"@ledgerhq/live-common": minor
---

Add a `custom.bottomSheet.error` wallet-api method for the mobile Borrow Live App. The embedded webview can now open an error-toned bottom sheet (rendered with `BottomSheetErrorGradient`) that resolves with `{ confirmed: true }` when the CTA is pressed and `{ confirmed: false }` when the sheet is closed or dragged down, mirroring the `custom.dialog.confirmation` contract.

Shared param validation lives in `@ledgerhq/live-common/wallet-api/Borrow/errorBottomSheetParams`. On mobile the sheet is driven by a dedicated Redux slice (`borrow.errorBottomSheet`) and a module-level resolver store. `QueuedDrawerBottomSheet` also gains a `backgroundComponent` prop so consumers can pass a status gradient explicitly without going through the tone context.
