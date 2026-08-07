---
"@ledgerhq/live-common": patch
"@ledgerhq/ledger-wallet-framework": patch
---

Let a family opt out of two generic operation-shaping heuristics.

`BridgeApi` gains `keepFeesOnlyNativeOpType` and `shouldBuildTokenAccount`. The first keeps a native operation with zero net value as its own type instead of collapsing it to `FEES`; Hedera bills account auto-creation that way, and the collapse mislabeled it. The second vetoes a token sub-account the balance data would otherwise produce; an ERC20 balance is a live contract read that returns zero for a token the account never held, so the generic builder created sub-accounts the legacy bridge did not.
