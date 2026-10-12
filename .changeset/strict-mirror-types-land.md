---
"@ledgerhq/coin-hedera": minor
---

Hedera mirror node types follow the mirror node swagger. The coin module logs each invalid element.

A missing array or pagination `links` in a mirror node response raises `HederaMirrorNodeResponseError`.
A null `balance` or `balance.balance` fails the sync. Before, it gave a NaN balance.
A missing `pending_reward` becomes 0.

The coin module skips and logs these elements:

- Transfers without `account` or `token_id`.
- Tokens without `token_id`.
- Nodes without `node_account_id`.
- Accounts without `account` during account discovery. Discovery continues with the other accounts.
- Own transactions that miss a core field.

A null token `created_timestamp` uses the current date.
A null `balance.timestamp` gives an uncommitted balance change of 0.
Operation details omit null gas fields.
Validators with null stake data get 0 values. The coin module does not mark them as overstaked.
