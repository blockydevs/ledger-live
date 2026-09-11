---
"@ledgerhq/coin-aleo": patch
---

Export `isValidatorBondable` as the single source of truth for whether a delegator may bond to a validator, and use it to sort over-concentrated validators to the end of the validator list.
