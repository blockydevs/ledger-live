---
"@ledgerhq/coin-icon": patch
---

Estimate send-max fees against a nominal amount, and treat a step limit of zero as a failed estimate. The node returns a step estimate of zero for a transfer of the whole balance, which put a step limit of zero into the transaction. The node then dropped the transaction.

Report only the fee as the operation value for a reverted transfer. A reverted transaction moves no value; the chain takes the step cost.
