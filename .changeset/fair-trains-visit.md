---
"live-mobile": minor
"ledger-live-desktop": minor
"@ledgerhq/live-common": minor
---

Earning-choice modal on Tezos LWM: tap "Stake" now routes via the shared getTezosEarnFlow helper to NoFunds / EarnRewards (delegate or stake) / DelegationStarted / DelegationSummary depending on funds, delegation state and the llmTezosStaking flag. Helper hoisted to live-common.
