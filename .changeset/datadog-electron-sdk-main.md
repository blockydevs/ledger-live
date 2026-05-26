---
"ledger-live-desktop": minor
---

Adopt `@datadog/electron-sdk` to cover the Electron main process. Uncaught exceptions, unhandled rejections, and renderer crashes (`render-process-gone`) are now reported to Datadog, and `dd-trace` adds main-process resource/trace and renderer telemetry forwarding. Gated by the existing `sentryLogs` user opt-in; no new feature flag.
