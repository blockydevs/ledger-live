---
"@ledgerhq/coin-hedera": patch
---

Validate Hedera mirror node responses in the API client. A missing critical field throws `HederaMirrorNodeResponseError` instead of producing a zero balance or fee.
