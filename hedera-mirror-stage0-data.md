# Hedera mirror node: Stage 0 field-nullability data

Date: 2026-10-12 (all requests made 10:15-10:25 local; chain time about 1791800000 = 2026-10-12).
Collected read-only with Node scripts (scratchpad stage0/: lib.mjs, run.mjs, supp.mjs). Rate about 9 req/s, 2629 requests, 0 retries after 429/5xx.
Definitions: "total" = number of observed field slots (for `x[].y`, every array element counted; a parent that is null or absent adds no slot). "null" = key present with JSON null. "missing" = key absent. "empty" = empty string (informational).
All networks: ids appear only as counts. No hard-required field was null or missing anywhere unless a row says so.

## Sampling method

- Mainnet transactions (T4): 18 time windows, `/transactions?limit=100&timestamp=lt:<NOW - d days>` for d in {latest,1,3,7,14,30,60,100,150,220,300,400,520,700,900,1200,1600,2000}, 6 pages each (10 800 tx). Plus `transactiontype=` filtered windows (contractcall, tokenassociate, ethereumtransaction, tokenmint, cryptoapproveallowance, scheduledelete; windows latest/60d/365d, 2 pages each; 3 600 tx; contractcreatetransaction returned 0). Plus 4 ascending windows from 2019-09, 2020-05, 2021-06, 2022-01 (3 pages each, 1 200 tx). Total 15 600 tx, 156 pages.
- Token fields (T1): token holders of 0.0.456858 (USDC) and 0.0.731861 (SAUCE): first 100 holders of each plus first 100 holders below account.id lt 0.0.1000000/3000000/5000000/7000000/9000000. After de-duplication 1049 accounts. Each queried with `/accounts/{id}/tokens?limit=100`, following `links.next`.
- Accounts (T2): `/accounts/{id}` for all of 0.0.1000-0.0.1200 (201); 150 random ids in 0.0.1-0.0.999 (31 returned 404); 150 random ids in 0.0.1201-0.0.100000 (12 returned 404); 300 accounts taken from the transfers of the latest-window mainnet transactions (198 have alias null; shown as "no-alias subset").
- Staking history (T5): from `staking_reward_transfers[].account` of the T4 sample (38 distinct accounts) the first 30 whose current `staked_node_id` is not null. Each queried current and with `?timestamp=lt:<NOW - d days>` for d in 30, 180, 365, 730.
- Nodes (T6): `/network/nodes?limit=100`, followed links, all three networks.
- Contract results (T7): `/contracts/results?limit=100`, 6 windows (latest, 3, 30, 120, 300, 600 days back), 1 page each = 600.
- Testnet/previewnet (T3): the first run used 10 windows (latest...220 days) x 1 page. Testnet returned 1000 tx; previewnet only 300 (it holds little history). A second run (supp) paged the latest 1000 tx on each network: previewnet history spans only about 10 minutes (1000 tx), testnet about 1.5 minutes. Accounts are the first 100 distinct `transfers[].account` of those tx (testnet 100, previewnet only 3 distinct). Token rows are from the first run (testnet: 100 accounts' tokens = 18 rows; previewnet 0 rows). Both networks are nearly empty for HTS data, so token-field results there carry no weight.
- Check 8: every page of every list endpoint was tested for `links` present and non-null, and for the array key present and an array.

## 4. Mainnet transactions (`/transactions`)

| endpoint | network | sample | field | slots | null | missing | empty-string |
|---|---|---|---|---|---|---|---|
| /transactions | mainnet (18 windows) | 10800 | `transaction_hash` | 10800 | 0 | 0 | 0 |
| /transactions | mainnet (18 windows) | 10800 | `consensus_timestamp` | 10800 | 0 | 0 | 0 |
| /transactions | mainnet (18 windows) | 10800 | `charged_tx_fee` | 10800 | 0 | 0 | 0 |
| /transactions | mainnet (18 windows) | 10800 | `nonce` | 10800 | 0 | 0 | 0 |
| /transactions | mainnet (18 windows) | 10800 | `result` | 10800 | 0 | 0 | 0 |
| /transactions | mainnet (18 windows) | 10800 | `name` | 10800 | 0 | 0 | 0 |
| /transactions | mainnet (18 windows) | 10800 | `transaction_id` | 10800 | 0 | 0 | 0 |
| /transactions | mainnet (18 windows) | 10800 | `transfers` | 10800 | 0 | 0 | 0 |
| /transactions | mainnet (18 windows) | 10800 | `transfers[].account` | 29731 | 0 | 0 | 0 |
| /transactions | mainnet (18 windows) | 10800 | `staking_reward_transfers` | 10800 | 0 | 0 | 0 |
| /transactions | mainnet (18 windows) | 10800 | `staking_reward_transfers[].account` | 40 | 0 | 0 | 0 |
| /transactions | mainnet (18 windows) | 10800 | `token_transfers` | 10800 | 0 | 0 | 0 |
| /transactions | mainnet (18 windows) | 10800 | `token_transfers[].account` | 912 | 0 | 0 | 0 |
| /transactions | mainnet (18 windows) | 10800 | `token_transfers[].token_id` | 912 | 0 | 0 | 0 |
| /transactions | mainnet (18 windows) | 10800 | `parent_consensus_timestamp` | 10800 | 9527 | 0 | 0 |
| /transactions | mainnet (18 windows) | 10800 | `entity_id` | 10800 | 5360 | 0 | 0 |
| /transactions | mainnet (18 windows) | 10800 | `node` | 10800 | 1275 | 0 | 0 |
| /transactions | mainnet (18 windows) | 10800 | `scheduled` | 10800 | 0 | 0 | 0 |
| /transactions | mainnet (18 windows) | 10800 | `max_fee` | 10800 | 0 | 0 | 0 |
| /transactions | mainnet (18 windows) | 10800 | `memo_base64` | 10800 | 0 | 0 | 6420 |
| /transactions | mainnet (type windows) | 3600 | `transaction_hash` | 3600 | 0 | 0 | 0 |
| /transactions | mainnet (type windows) | 3600 | `consensus_timestamp` | 3600 | 0 | 0 | 0 |
| /transactions | mainnet (type windows) | 3600 | `charged_tx_fee` | 3600 | 0 | 0 | 0 |
| /transactions | mainnet (type windows) | 3600 | `nonce` | 3600 | 0 | 0 | 0 |
| /transactions | mainnet (type windows) | 3600 | `result` | 3600 | 0 | 0 | 0 |
| /transactions | mainnet (type windows) | 3600 | `name` | 3600 | 0 | 0 | 0 |
| /transactions | mainnet (type windows) | 3600 | `transaction_id` | 3600 | 0 | 0 | 0 |
| /transactions | mainnet (type windows) | 3600 | `transfers` | 3600 | 0 | 0 | 0 |
| /transactions | mainnet (type windows) | 3600 | `transfers[].account` | 5750 | 0 | 0 | 0 |
| /transactions | mainnet (type windows) | 3600 | `staking_reward_transfers` | 3600 | 0 | 0 | 0 |
| /transactions | mainnet (type windows) | 3600 | `staking_reward_transfers[].account` | 69 | 0 | 0 | 0 |
| /transactions | mainnet (type windows) | 3600 | `token_transfers` | 3600 | 0 | 0 | 0 |
| /transactions | mainnet (type windows) | 3600 | `token_transfers[].account` | 429 | 0 | 0 | 0 |
| /transactions | mainnet (type windows) | 3600 | `token_transfers[].token_id` | 429 | 0 | 0 | 0 |
| /transactions | mainnet (type windows) | 3600 | `parent_consensus_timestamp` | 3600 | 2460 | 0 | 0 |
| /transactions | mainnet (type windows) | 3600 | `entity_id` | 3600 | 817 | 0 | 0 |
| /transactions | mainnet (type windows) | 3600 | `node` | 3600 | 1140 | 0 | 0 |
| /transactions | mainnet (type windows) | 3600 | `scheduled` | 3600 | 0 | 0 | 0 |
| /transactions | mainnet (type windows) | 3600 | `max_fee` | 3600 | 0 | 0 | 0 |
| /transactions | mainnet (type windows) | 3600 | `memo_base64` | 3600 | 0 | 0 | 2946 |
| /transactions | mainnet (old ascending) | 1200 | `transaction_hash` | 1200 | 0 | 0 | 0 |
| /transactions | mainnet (old ascending) | 1200 | `consensus_timestamp` | 1200 | 0 | 0 | 0 |
| /transactions | mainnet (old ascending) | 1200 | `charged_tx_fee` | 1200 | 0 | 0 | 0 |
| /transactions | mainnet (old ascending) | 1200 | `nonce` | 1200 | 0 | 0 | 0 |
| /transactions | mainnet (old ascending) | 1200 | `result` | 1200 | 0 | 0 | 0 |
| /transactions | mainnet (old ascending) | 1200 | `name` | 1200 | 0 | 0 | 0 |
| /transactions | mainnet (old ascending) | 1200 | `transaction_id` | 1200 | 0 | 0 | 0 |
| /transactions | mainnet (old ascending) | 1200 | `transfers` | 1200 | 0 | 0 | 0 |
| /transactions | mainnet (old ascending) | 1200 | `transfers[].account` | 5466 | 0 | 0 | 0 |
| /transactions | mainnet (old ascending) | 1200 | `staking_reward_transfers` | 1200 | 0 | 0 | 0 |
| /transactions | mainnet (old ascending) | 1200 | `staking_reward_transfers[].account` | 0 | 0 | 0 | 0 |
| /transactions | mainnet (old ascending) | 1200 | `token_transfers` | 1200 | 0 | 0 | 0 |
| /transactions | mainnet (old ascending) | 1200 | `token_transfers[].account` | 2 | 0 | 0 | 0 |
| /transactions | mainnet (old ascending) | 1200 | `token_transfers[].token_id` | 2 | 0 | 0 | 0 |
| /transactions | mainnet (old ascending) | 1200 | `parent_consensus_timestamp` | 1200 | 1200 | 0 | 0 |
| /transactions | mainnet (old ascending) | 1200 | `entity_id` | 1200 | 666 | 0 | 0 |
| /transactions | mainnet (old ascending) | 1200 | `node` | 1200 | 0 | 0 | 0 |
| /transactions | mainnet (old ascending) | 1200 | `scheduled` | 1200 | 0 | 0 | 0 |
| /transactions | mainnet (old ascending) | 1200 | `max_fee` | 1200 | 0 | 0 | 0 |
| /transactions | mainnet (old ascending) | 1200 | `memo_base64` | 1200 | 0 | 0 | 1099 |

Pages: 108 + 36 + 12; pages without `links`: 0; pages without `transactions` array: 0.

## 1. Token rows (`/accounts/{id}/tokens`, mainnet)

Accounts queried: 1049 (all returned at least one token), token rows: 13364, pages: 1095, pages without links: 0, without `tokens` array: 0.

| endpoint | network | sample | field | slots | null | missing | empty-string |
|---|---|---|---|---|---|---|---|
| /accounts/{id}/tokens | mainnet | 13364 | `token_id` | 13364 | 0 | 0 | 0 |
| /accounts/{id}/tokens | mainnet | 13364 | `decimals` | 13364 | 0 | 0 | 0 |
| /accounts/{id}/tokens | mainnet | 13364 | `automatic_association` | 13364 | 0 | 0 | 0 |
| /accounts/{id}/tokens | mainnet | 13364 | `freeze_status` | 13364 | 0 | 0 | 0 |
| /accounts/{id}/tokens | mainnet | 13364 | `kyc_status` | 13364 | 0 | 0 | 0 |
| /accounts/{id}/tokens | mainnet | 13364 | `created_timestamp` | 13364 | 0 | 0 | 0 |
| /accounts/{id}/tokens | mainnet | 13364 | `balance` | 13364 | 0 | 0 | 0 |

## 2. Accounts (`/accounts/{id}`, mainnet)

| endpoint | network | sample | field | slots | null | missing | empty-string |
|---|---|---|---|---|---|---|---|
| /accounts/{id} | mainnet 0.0.1000-1200 (all) | 201 | `account` | 201 | 0 | 0 | 0 |
| /accounts/{id} | mainnet 0.0.1000-1200 (all) | 201 | `evm_address` | 201 | 0 | 0 | 0 |
| /accounts/{id} | mainnet 0.0.1000-1200 (all) | 201 | `alias` | 201 | 201 | 0 | 0 |
| /accounts/{id} | mainnet 0.0.1000-1200 (all) | 201 | `balance` | 201 | 0 | 0 | 0 |
| /accounts/{id} | mainnet 0.0.1000-1200 (all) | 201 | `balance.balance` | 201 | 0 | 0 | 0 |
| /accounts/{id} | mainnet 0.0.1000-1200 (all) | 201 | `balance.timestamp` | 201 | 0 | 0 | 0 |
| /accounts/{id} | mainnet 0.0.1000-1200 (all) | 201 | `balance.tokens` | 201 | 0 | 0 | 0 |
| /accounts/{id} | mainnet 0.0.1000-1200 (all) | 201 | `balance.tokens[].token_id` | 188 | 0 | 0 | 0 |
| /accounts/{id} | mainnet 0.0.1000-1200 (all) | 201 | `pending_reward` | 201 | 0 | 0 | 0 |
| /accounts/{id} | mainnet 0.0.1000-1200 (all) | 201 | `max_automatic_token_associations` | 201 | 0 | 0 | 0 |
| /accounts/{id} | mainnet 0.0.1000-1200 (all) | 201 | `staked_node_id` | 201 | 182 | 0 | 0 |
| /accounts/{id} | mainnet 0.0.1000-1200 (all) | 201 | `decline_reward` | 201 | 0 | 0 | 0 |
| /accounts/{id} | mainnet 0.0.1000-1200 (all) | 201 | `created_timestamp` | 201 | 111 | 0 | 0 |
| /accounts/{id} | mainnet random 0.0.1-999 (200 OK) | 119 | `account` | 119 | 0 | 0 | 0 |
| /accounts/{id} | mainnet random 0.0.1-999 (200 OK) | 119 | `evm_address` | 119 | 0 | 0 | 0 |
| /accounts/{id} | mainnet random 0.0.1-999 (200 OK) | 119 | `alias` | 119 | 119 | 0 | 0 |
| /accounts/{id} | mainnet random 0.0.1-999 (200 OK) | 119 | `balance` | 119 | 0 | 0 | 0 |
| /accounts/{id} | mainnet random 0.0.1-999 (200 OK) | 119 | `balance.balance` | 119 | 0 | 0 | 0 |
| /accounts/{id} | mainnet random 0.0.1-999 (200 OK) | 119 | `balance.timestamp` | 119 | 0 | 0 | 0 |
| /accounts/{id} | mainnet random 0.0.1-999 (200 OK) | 119 | `balance.tokens` | 119 | 0 | 0 | 0 |
| /accounts/{id} | mainnet random 0.0.1-999 (200 OK) | 119 | `balance.tokens[].token_id` | 4 | 0 | 0 | 0 |
| /accounts/{id} | mainnet random 0.0.1-999 (200 OK) | 119 | `pending_reward` | 119 | 0 | 0 | 0 |
| /accounts/{id} | mainnet random 0.0.1-999 (200 OK) | 119 | `max_automatic_token_associations` | 119 | 14 | 0 | 0 |
| /accounts/{id} | mainnet random 0.0.1-999 (200 OK) | 119 | `staked_node_id` | 119 | 114 | 0 | 0 |
| /accounts/{id} | mainnet random 0.0.1-999 (200 OK) | 119 | `decline_reward` | 119 | 0 | 0 | 0 |
| /accounts/{id} | mainnet random 0.0.1-999 (200 OK) | 119 | `created_timestamp` | 119 | 51 | 0 | 0 |
| /accounts/{id} | mainnet random 0.0.1201-100000 (200 OK) | 138 | `account` | 138 | 0 | 0 | 0 |
| /accounts/{id} | mainnet random 0.0.1201-100000 (200 OK) | 138 | `evm_address` | 138 | 0 | 0 | 0 |
| /accounts/{id} | mainnet random 0.0.1201-100000 (200 OK) | 138 | `alias` | 138 | 138 | 0 | 0 |
| /accounts/{id} | mainnet random 0.0.1201-100000 (200 OK) | 138 | `balance` | 138 | 0 | 0 | 0 |
| /accounts/{id} | mainnet random 0.0.1201-100000 (200 OK) | 138 | `balance.balance` | 138 | 0 | 0 | 0 |
| /accounts/{id} | mainnet random 0.0.1201-100000 (200 OK) | 138 | `balance.timestamp` | 138 | 0 | 0 | 0 |
| /accounts/{id} | mainnet random 0.0.1201-100000 (200 OK) | 138 | `balance.tokens` | 138 | 0 | 0 | 0 |
| /accounts/{id} | mainnet random 0.0.1201-100000 (200 OK) | 138 | `balance.tokens[].token_id` | 1 | 0 | 0 | 0 |
| /accounts/{id} | mainnet random 0.0.1201-100000 (200 OK) | 138 | `pending_reward` | 138 | 0 | 0 | 0 |
| /accounts/{id} | mainnet random 0.0.1201-100000 (200 OK) | 138 | `max_automatic_token_associations` | 138 | 0 | 0 | 0 |
| /accounts/{id} | mainnet random 0.0.1201-100000 (200 OK) | 138 | `staked_node_id` | 138 | 136 | 0 | 0 |
| /accounts/{id} | mainnet random 0.0.1201-100000 (200 OK) | 138 | `decline_reward` | 138 | 0 | 0 | 0 |
| /accounts/{id} | mainnet random 0.0.1201-100000 (200 OK) | 138 | `created_timestamp` | 138 | 21 | 0 | 0 |
| /accounts/{id} | mainnet recent active (300) | 300 | `account` | 300 | 0 | 0 | 0 |
| /accounts/{id} | mainnet recent active (300) | 300 | `evm_address` | 300 | 0 | 0 | 0 |
| /accounts/{id} | mainnet recent active (300) | 300 | `alias` | 300 | 198 | 0 | 0 |
| /accounts/{id} | mainnet recent active (300) | 300 | `balance` | 300 | 0 | 0 | 0 |
| /accounts/{id} | mainnet recent active (300) | 300 | `balance.balance` | 300 | 0 | 0 | 0 |
| /accounts/{id} | mainnet recent active (300) | 300 | `balance.timestamp` | 300 | 0 | 0 | 0 |
| /accounts/{id} | mainnet recent active (300) | 300 | `balance.tokens` | 300 | 0 | 0 | 0 |
| /accounts/{id} | mainnet recent active (300) | 300 | `balance.tokens[].token_id` | 4759 | 0 | 0 | 0 |
| /accounts/{id} | mainnet recent active (300) | 300 | `pending_reward` | 300 | 0 | 0 | 0 |
| /accounts/{id} | mainnet recent active (300) | 300 | `max_automatic_token_associations` | 300 | 1 | 0 | 0 |
| /accounts/{id} | mainnet recent active (300) | 300 | `staked_node_id` | 300 | 246 | 0 | 0 |
| /accounts/{id} | mainnet recent active (300) | 300 | `decline_reward` | 300 | 0 | 0 | 0 |
| /accounts/{id} | mainnet recent active (300) | 300 | `created_timestamp` | 300 | 36 | 0 | 0 |
| /accounts/{id} | mainnet recent, alias null subset | 198 | `account` | 198 | 0 | 0 | 0 |
| /accounts/{id} | mainnet recent, alias null subset | 198 | `evm_address` | 198 | 0 | 0 | 0 |
| /accounts/{id} | mainnet recent, alias null subset | 198 | `alias` | 198 | 198 | 0 | 0 |
| /accounts/{id} | mainnet recent, alias null subset | 198 | `balance` | 198 | 0 | 0 | 0 |
| /accounts/{id} | mainnet recent, alias null subset | 198 | `balance.balance` | 198 | 0 | 0 | 0 |
| /accounts/{id} | mainnet recent, alias null subset | 198 | `balance.timestamp` | 198 | 0 | 0 | 0 |
| /accounts/{id} | mainnet recent, alias null subset | 198 | `balance.tokens` | 198 | 0 | 0 | 0 |
| /accounts/{id} | mainnet recent, alias null subset | 198 | `balance.tokens[].token_id` | 3860 | 0 | 0 | 0 |
| /accounts/{id} | mainnet recent, alias null subset | 198 | `pending_reward` | 198 | 0 | 0 | 0 |
| /accounts/{id} | mainnet recent, alias null subset | 198 | `max_automatic_token_associations` | 198 | 1 | 0 | 0 |
| /accounts/{id} | mainnet recent, alias null subset | 198 | `staked_node_id` | 198 | 151 | 0 | 0 |
| /accounts/{id} | mainnet recent, alias null subset | 198 | `decline_reward` | 198 | 0 | 0 | 0 |
| /accounts/{id} | mainnet recent, alias null subset | 198 | `created_timestamp` | 198 | 36 | 0 | 0 |

HTTP statuses: 1000-1200: {"200":201}; 1-999: {"200":119,"404":31}; 1201-100000: {"200":138,"404":12}; recent: {"200":300}. 404 means the account does not exist; it is not a null field.

## 3. Testnet and previewnet

| endpoint | network | sample | field | slots | null | missing | empty-string |
|---|---|---|---|---|---|---|---|
| /transactions | testnet | 1000 | `transaction_hash` | 1000 | 0 | 0 | 0 |
| /transactions | testnet | 1000 | `consensus_timestamp` | 1000 | 0 | 0 | 0 |
| /transactions | testnet | 1000 | `charged_tx_fee` | 1000 | 0 | 0 | 0 |
| /transactions | testnet | 1000 | `nonce` | 1000 | 0 | 0 | 0 |
| /transactions | testnet | 1000 | `result` | 1000 | 0 | 0 | 0 |
| /transactions | testnet | 1000 | `name` | 1000 | 0 | 0 | 0 |
| /transactions | testnet | 1000 | `transaction_id` | 1000 | 0 | 0 | 0 |
| /transactions | testnet | 1000 | `transfers[].account` | 2109 | 0 | 0 | 0 |
| /transactions | testnet | 1000 | `staking_reward_transfers[].account` | 0 | 0 | 0 | 0 |
| /transactions | testnet | 1000 | `token_transfers[].account` | 5 | 0 | 0 | 0 |
| /transactions | testnet | 1000 | `token_transfers[].token_id` | 5 | 0 | 0 | 0 |
| /transactions | testnet | 1000 | `parent_consensus_timestamp` | 1000 | 1000 | 0 | 0 |
| /accounts/{id} | testnet | 100 | `account` | 100 | 0 | 0 | 0 |
| /accounts/{id} | testnet | 100 | `evm_address` | 100 | 0 | 0 | 0 |
| /accounts/{id} | testnet | 100 | `alias` | 100 | 10 | 0 | 0 |
| /accounts/{id} | testnet | 100 | `balance.balance` | 100 | 0 | 0 | 0 |
| /accounts/{id} | testnet | 100 | `balance.timestamp` | 100 | 0 | 0 | 0 |
| /accounts/{id} | testnet | 100 | `balance.tokens[].token_id` | 4 | 0 | 0 | 0 |
| /accounts/{id} | testnet | 100 | `pending_reward` | 100 | 0 | 0 | 0 |
| /accounts/{id} | testnet | 100 | `max_automatic_token_associations` | 100 | 0 | 0 | 0 |
| /accounts/{id} | testnet | 100 | `staked_node_id` | 100 | 99 | 0 | 0 |
| /accounts/{id} | testnet | 100 | `decline_reward` | 100 | 0 | 0 | 0 |
| /accounts/{id} | testnet | 100 | `created_timestamp` | 100 | 0 | 0 | 0 |
| /accounts/{id}/tokens | testnet | 18 | `token_id` | 18 | 0 | 0 | 0 |
| /accounts/{id}/tokens | testnet | 18 | `decimals` | 18 | 0 | 0 | 0 |
| /accounts/{id}/tokens | testnet | 18 | `automatic_association` | 18 | 0 | 0 | 0 |
| /accounts/{id}/tokens | testnet | 18 | `freeze_status` | 18 | 0 | 0 | 0 |
| /accounts/{id}/tokens | testnet | 18 | `kyc_status` | 18 | 0 | 0 | 0 |
| /accounts/{id}/tokens | testnet | 18 | `created_timestamp` | 18 | 0 | 0 | 0 |
| /accounts/{id}/tokens | testnet | 18 | `balance` | 18 | 0 | 0 | 0 |
| /transactions | previewnet | 1000 | `transaction_hash` | 1000 | 0 | 0 | 0 |
| /transactions | previewnet | 1000 | `consensus_timestamp` | 1000 | 0 | 0 | 0 |
| /transactions | previewnet | 1000 | `charged_tx_fee` | 1000 | 0 | 0 | 0 |
| /transactions | previewnet | 1000 | `nonce` | 1000 | 0 | 0 | 0 |
| /transactions | previewnet | 1000 | `result` | 1000 | 0 | 0 | 0 |
| /transactions | previewnet | 1000 | `name` | 1000 | 0 | 0 | 0 |
| /transactions | previewnet | 1000 | `transaction_id` | 1000 | 0 | 0 | 0 |
| /transactions | previewnet | 1000 | `transfers[].account` | 2805 | 0 | 0 | 0 |
| /transactions | previewnet | 1000 | `staking_reward_transfers[].account` | 0 | 0 | 0 | 0 |
| /transactions | previewnet | 1000 | `token_transfers[].account` | 0 | 0 | 0 | 0 |
| /transactions | previewnet | 1000 | `token_transfers[].token_id` | 0 | 0 | 0 | 0 |
| /transactions | previewnet | 1000 | `parent_consensus_timestamp` | 1000 | 1000 | 0 | 0 |
| /accounts/{id} | previewnet | 3 | `account` | 3 | 0 | 0 | 0 |
| /accounts/{id} | previewnet | 3 | `evm_address` | 3 | 0 | 0 | 0 |
| /accounts/{id} | previewnet | 3 | `alias` | 3 | 3 | 0 | 0 |
| /accounts/{id} | previewnet | 3 | `balance.balance` | 3 | 0 | 0 | 0 |
| /accounts/{id} | previewnet | 3 | `balance.timestamp` | 3 | 0 | 0 | 0 |
| /accounts/{id} | previewnet | 3 | `balance.tokens[].token_id` | 0 | 0 | 0 | 0 |
| /accounts/{id} | previewnet | 3 | `pending_reward` | 3 | 0 | 0 | 0 |
| /accounts/{id} | previewnet | 3 | `max_automatic_token_associations` | 3 | 0 | 0 | 0 |
| /accounts/{id} | previewnet | 3 | `staked_node_id` | 3 | 3 | 0 | 0 |
| /accounts/{id} | previewnet | 3 | `decline_reward` | 3 | 0 | 0 | 0 |
| /accounts/{id} | previewnet | 3 | `created_timestamp` | 3 | 0 | 0 | 0 |
| /accounts/{id}/tokens | previewnet | 0 | `token_id` | 0 | 0 | 0 | 0 |
| /accounts/{id}/tokens | previewnet | 0 | `decimals` | 0 | 0 | 0 | 0 |
| /accounts/{id}/tokens | previewnet | 0 | `automatic_association` | 0 | 0 | 0 | 0 |
| /accounts/{id}/tokens | previewnet | 0 | `freeze_status` | 0 | 0 | 0 | 0 |
| /accounts/{id}/tokens | previewnet | 0 | `kyc_status` | 0 | 0 | 0 | 0 |
| /accounts/{id}/tokens | previewnet | 0 | `created_timestamp` | 0 | 0 | 0 | 0 |
| /accounts/{id}/tokens | previewnet | 0 | `balance` | 0 | 0 | 0 | 0 |

Pages without `links` / array key (transactions): testnet 0/0, previewnet 0/0. Account statuses: testnet {"200":100}, previewnet {"200":3}.

## 5. Staking accounts, historical state (`/accounts/{id}?timestamp=lt:...`, mainnet)

Staking accounts: 30 (from 38 reward-receiving accounts).

| endpoint | network | sample | field | slots | null | missing | empty-string |
|---|---|---|---|---|---|---|---|
| /accounts/{id} | mainnet current (statuses {"200":30}) | 30 | `evm_address` | 30 | 0 | 0 | 0 |
| /accounts/{id} | mainnet current (statuses {"200":30}) | 30 | `balance` | 30 | 0 | 0 | 0 |
| /accounts/{id} | mainnet current (statuses {"200":30}) | 30 | `balance.balance` | 30 | 0 | 0 | 0 |
| /accounts/{id} | mainnet current (statuses {"200":30}) | 30 | `balance.timestamp` | 30 | 0 | 0 | 0 |
| /accounts/{id} | mainnet current (statuses {"200":30}) | 30 | `pending_reward` | 30 | 0 | 0 | 0 |
| /accounts/{id} | mainnet current (statuses {"200":30}) | 30 | `staked_node_id` | 30 | 0 | 0 | 0 |
| /accounts/{id} | mainnet current (statuses {"200":30}) | 30 | `decline_reward` | 30 | 0 | 0 | 0 |
| /accounts/{id} | mainnet current (statuses {"200":30}) | 30 | `max_automatic_token_associations` | 30 | 0 | 0 | 0 |
| /accounts/{id} | mainnet current (statuses {"200":30}) | 30 | `alias` | 30 | 27 | 0 | 0 |
| /accounts/{id}?timestamp=lt:now-30d | mainnet lt_now_minus_30d (statuses {"200":29,"404":1}) | 29 | `evm_address` | 29 | 0 | 0 | 0 |
| /accounts/{id}?timestamp=lt:now-30d | mainnet lt_now_minus_30d (statuses {"200":29,"404":1}) | 29 | `balance` | 29 | 0 | 0 | 0 |
| /accounts/{id}?timestamp=lt:now-30d | mainnet lt_now_minus_30d (statuses {"200":29,"404":1}) | 29 | `balance.balance` | 29 | 0 | 0 | 0 |
| /accounts/{id}?timestamp=lt:now-30d | mainnet lt_now_minus_30d (statuses {"200":29,"404":1}) | 29 | `balance.timestamp` | 29 | 0 | 0 | 0 |
| /accounts/{id}?timestamp=lt:now-30d | mainnet lt_now_minus_30d (statuses {"200":29,"404":1}) | 29 | `pending_reward` | 29 | 0 | 0 | 0 |
| /accounts/{id}?timestamp=lt:now-30d | mainnet lt_now_minus_30d (statuses {"200":29,"404":1}) | 29 | `staked_node_id` | 29 | 0 | 0 | 0 |
| /accounts/{id}?timestamp=lt:now-30d | mainnet lt_now_minus_30d (statuses {"200":29,"404":1}) | 29 | `decline_reward` | 29 | 0 | 0 | 0 |
| /accounts/{id}?timestamp=lt:now-30d | mainnet lt_now_minus_30d (statuses {"200":29,"404":1}) | 29 | `max_automatic_token_associations` | 29 | 0 | 0 | 0 |
| /accounts/{id}?timestamp=lt:now-30d | mainnet lt_now_minus_30d (statuses {"200":29,"404":1}) | 29 | `alias` | 29 | 26 | 0 | 0 |
| /accounts/{id}?timestamp=lt:now-180d | mainnet lt_now_minus_180d (statuses {"200":26,"404":4}) | 26 | `evm_address` | 26 | 0 | 0 | 0 |
| /accounts/{id}?timestamp=lt:now-180d | mainnet lt_now_minus_180d (statuses {"200":26,"404":4}) | 26 | `balance` | 26 | 0 | 0 | 0 |
| /accounts/{id}?timestamp=lt:now-180d | mainnet lt_now_minus_180d (statuses {"200":26,"404":4}) | 26 | `balance.balance` | 26 | 0 | 0 | 0 |
| /accounts/{id}?timestamp=lt:now-180d | mainnet lt_now_minus_180d (statuses {"200":26,"404":4}) | 26 | `balance.timestamp` | 26 | 0 | 0 | 0 |
| /accounts/{id}?timestamp=lt:now-180d | mainnet lt_now_minus_180d (statuses {"200":26,"404":4}) | 26 | `pending_reward` | 26 | 0 | 0 | 0 |
| /accounts/{id}?timestamp=lt:now-180d | mainnet lt_now_minus_180d (statuses {"200":26,"404":4}) | 26 | `staked_node_id` | 26 | 1 | 0 | 0 |
| /accounts/{id}?timestamp=lt:now-180d | mainnet lt_now_minus_180d (statuses {"200":26,"404":4}) | 26 | `decline_reward` | 26 | 0 | 0 | 0 |
| /accounts/{id}?timestamp=lt:now-180d | mainnet lt_now_minus_180d (statuses {"200":26,"404":4}) | 26 | `max_automatic_token_associations` | 26 | 0 | 0 | 0 |
| /accounts/{id}?timestamp=lt:now-180d | mainnet lt_now_minus_180d (statuses {"200":26,"404":4}) | 26 | `alias` | 26 | 23 | 0 | 0 |
| /accounts/{id}?timestamp=lt:now-365d | mainnet lt_now_minus_365d (statuses {"200":19,"404":11}) | 19 | `evm_address` | 19 | 0 | 0 | 0 |
| /accounts/{id}?timestamp=lt:now-365d | mainnet lt_now_minus_365d (statuses {"200":19,"404":11}) | 19 | `balance` | 19 | 0 | 0 | 0 |
| /accounts/{id}?timestamp=lt:now-365d | mainnet lt_now_minus_365d (statuses {"200":19,"404":11}) | 19 | `balance.balance` | 19 | 0 | 0 | 0 |
| /accounts/{id}?timestamp=lt:now-365d | mainnet lt_now_minus_365d (statuses {"200":19,"404":11}) | 19 | `balance.timestamp` | 19 | 0 | 0 | 0 |
| /accounts/{id}?timestamp=lt:now-365d | mainnet lt_now_minus_365d (statuses {"200":19,"404":11}) | 19 | `pending_reward` | 19 | 0 | 0 | 0 |
| /accounts/{id}?timestamp=lt:now-365d | mainnet lt_now_minus_365d (statuses {"200":19,"404":11}) | 19 | `staked_node_id` | 19 | 4 | 0 | 0 |
| /accounts/{id}?timestamp=lt:now-365d | mainnet lt_now_minus_365d (statuses {"200":19,"404":11}) | 19 | `decline_reward` | 19 | 0 | 0 | 0 |
| /accounts/{id}?timestamp=lt:now-365d | mainnet lt_now_minus_365d (statuses {"200":19,"404":11}) | 19 | `max_automatic_token_associations` | 19 | 0 | 0 | 0 |
| /accounts/{id}?timestamp=lt:now-365d | mainnet lt_now_minus_365d (statuses {"200":19,"404":11}) | 19 | `alias` | 19 | 19 | 0 | 0 |
| /accounts/{id}?timestamp=lt:now-730d | mainnet lt_now_minus_730d (statuses {"200":14,"404":16}) | 14 | `evm_address` | 14 | 0 | 0 | 0 |
| /accounts/{id}?timestamp=lt:now-730d | mainnet lt_now_minus_730d (statuses {"200":14,"404":16}) | 14 | `balance` | 14 | 0 | 0 | 0 |
| /accounts/{id}?timestamp=lt:now-730d | mainnet lt_now_minus_730d (statuses {"200":14,"404":16}) | 14 | `balance.balance` | 14 | 0 | 0 | 0 |
| /accounts/{id}?timestamp=lt:now-730d | mainnet lt_now_minus_730d (statuses {"200":14,"404":16}) | 14 | `balance.timestamp` | 14 | 0 | 0 | 0 |
| /accounts/{id}?timestamp=lt:now-730d | mainnet lt_now_minus_730d (statuses {"200":14,"404":16}) | 14 | `pending_reward` | 14 | 0 | 0 | 0 |
| /accounts/{id}?timestamp=lt:now-730d | mainnet lt_now_minus_730d (statuses {"200":14,"404":16}) | 14 | `staked_node_id` | 14 | 2 | 0 | 0 |
| /accounts/{id}?timestamp=lt:now-730d | mainnet lt_now_minus_730d (statuses {"200":14,"404":16}) | 14 | `decline_reward` | 14 | 0 | 0 | 0 |
| /accounts/{id}?timestamp=lt:now-730d | mainnet lt_now_minus_730d (statuses {"200":14,"404":16}) | 14 | `max_automatic_token_associations` | 14 | 0 | 0 | 0 |
| /accounts/{id}?timestamp=lt:now-730d | mainnet lt_now_minus_730d (statuses {"200":14,"404":16}) | 14 | `alias` | 14 | 14 | 0 | 0 |

A 404 on a historical query means the account did not exist at that time. `staked_node_id` null in a historical row means the account was not yet staking then.

## 6. `/network/nodes`

| endpoint | network | sample | field | slots | null | missing | empty-string |
|---|---|---|---|---|---|---|---|
| /network/nodes | mainnet | 30 | `node_account_id` | 30 | 0 | 0 | 0 |
| /network/nodes | mainnet | 30 | `min_stake` | 30 | 0 | 0 | 0 |
| /network/nodes | mainnet | 30 | `max_stake` | 30 | 0 | 0 | 0 |
| /network/nodes | mainnet | 30 | `stake_rewarded` | 30 | 0 | 0 | 0 |
| /network/nodes | mainnet | 30 | `reward_rate_start` | 30 | 0 | 0 | 0 |
| /network/nodes | mainnet | 30 | `description` | 30 | 0 | 0 | 0 |
| /network/nodes | mainnet | 30 | `stake` | 30 | 0 | 0 | 0 |
| /network/nodes | mainnet | 30 | `node_id` | 30 | 0 | 0 | 0 |
| /network/nodes | mainnet | 30 | `stake_total` | 30 | 0 | 30 | 0 |
| /network/nodes | mainnet | 30 | `staking_period` | 30 | 0 | 0 | 0 |
| /network/nodes | mainnet | 30 | `decline_reward` | 30 | 0 | 0 | 0 |
| /network/nodes | mainnet | 30 | `service_endpoints` | 30 | 0 | 0 | 0 |
| /network/nodes | mainnet | 30 | `address_book` | 30 | 0 | 30 | 0 |
| /network/nodes | testnet | 7 | `node_account_id` | 7 | 0 | 0 | 0 |
| /network/nodes | testnet | 7 | `min_stake` | 7 | 0 | 0 | 0 |
| /network/nodes | testnet | 7 | `max_stake` | 7 | 0 | 0 | 0 |
| /network/nodes | testnet | 7 | `stake_rewarded` | 7 | 0 | 0 | 0 |
| /network/nodes | testnet | 7 | `reward_rate_start` | 7 | 0 | 0 | 0 |
| /network/nodes | testnet | 7 | `description` | 7 | 0 | 0 | 0 |
| /network/nodes | testnet | 7 | `stake` | 7 | 0 | 0 | 0 |
| /network/nodes | testnet | 7 | `node_id` | 7 | 0 | 0 | 0 |
| /network/nodes | testnet | 7 | `stake_total` | 7 | 0 | 7 | 0 |
| /network/nodes | testnet | 7 | `staking_period` | 7 | 0 | 0 | 0 |
| /network/nodes | testnet | 7 | `decline_reward` | 7 | 0 | 0 | 0 |
| /network/nodes | testnet | 7 | `service_endpoints` | 7 | 0 | 0 | 0 |
| /network/nodes | testnet | 7 | `address_book` | 7 | 0 | 7 | 0 |
| /network/nodes | previewnet | 7 | `node_account_id` | 7 | 0 | 0 | 0 |
| /network/nodes | previewnet | 7 | `min_stake` | 7 | 0 | 0 | 0 |
| /network/nodes | previewnet | 7 | `max_stake` | 7 | 0 | 0 | 0 |
| /network/nodes | previewnet | 7 | `stake_rewarded` | 7 | 0 | 0 | 0 |
| /network/nodes | previewnet | 7 | `reward_rate_start` | 7 | 0 | 0 | 0 |
| /network/nodes | previewnet | 7 | `description` | 7 | 0 | 0 | 0 |
| /network/nodes | previewnet | 7 | `stake` | 7 | 0 | 0 | 0 |
| /network/nodes | previewnet | 7 | `node_id` | 7 | 0 | 0 | 0 |
| /network/nodes | previewnet | 7 | `stake_total` | 7 | 0 | 7 | 0 |
| /network/nodes | previewnet | 7 | `staking_period` | 7 | 0 | 0 | 0 |
| /network/nodes | previewnet | 7 | `decline_reward` | 7 | 0 | 0 | 0 |
| /network/nodes | previewnet | 7 | `service_endpoints` | 7 | 0 | 0 | 0 |
| /network/nodes | previewnet | 7 | `address_book` | 7 | 0 | 7 | 0 |

`stake_total` and `address_book` do not exist in the response (probed names; not Swagger fields), so ignore their 'missing' counts. Pages without links/array: 0 on all three.

## 7. `/contracts/results` (mainnet)

| endpoint | network | sample | field | slots | null | missing | empty-string |
|---|---|---|---|---|---|---|---|
| /contracts/results | mainnet | 600 | `contract_id` | 600 | 0 | 0 | 0 |
| /contracts/results | mainnet | 600 | `block_hash` | 600 | 0 | 0 | 0 |
| /contracts/results | mainnet | 600 | `block_gas_used` | 600 | 0 | 0 | 0 |
| /contracts/results | mainnet | 600 | `gas_consumed` | 600 | 250 | 0 | 0 |
| /contracts/results | mainnet | 600 | `gas_used` | 600 | 250 | 0 | 0 |
| /contracts/results | mainnet | 600 | `gas_limit` | 600 | 0 | 0 | 0 |
| /contracts/results | mainnet | 600 | `hash` | 600 | 0 | 0 | 0 |
| /contracts/results | mainnet | 600 | `timestamp` | 600 | 0 | 0 | 0 |
| /contracts/results | mainnet | 600 | `result` | 600 | 0 | 0 | 0 |
| /contracts/results | mainnet | 600 | `block_number` | 600 | 0 | 0 | 0 |
| /contracts/results | mainnet | 600 | `from` | 600 | 0 | 0 | 0 |
| /contracts/results | mainnet | 600 | `to` | 600 | 0 | 0 | 0 |
| /contracts/results | mainnet | 600 | `error_message` | 600 | 555 | 0 | 0 |
| /contracts/results | mainnet | 600 | `status` | 600 | 0 | 0 | 0 |
| /contracts/results | mainnet | 600 | `transaction_index` | 600 | 0 | 0 | 0 |

Pages: 6; without links: 0; without `results` array: 0.

## 8. List responses without `links` or array key

| endpoint | network | pages | no links | no array key |
|---|---|---|---|---|
| /transactions | mainnet | 156 | 0 | 0 |
| /accounts/{id}/tokens | mainnet | 1095 | 0 | 0 |
| /network/nodes | mainnet / testnet / previewnet | 2 / 1 / 1 | 0 | 0 |
| /contracts/results | mainnet | 6 | 0 | 0 |
| /transactions | testnet / previewnet | 10 / 10 (supp run) | 0 | 0 |
| /tokens/{id}/balances (used for sampling) | mainnet | 12 | 0 | 0 |

Single-account responses (`/accounts/{id}`) always carried a `links` object too (not counted). Empty `tokens: []` arrays are present for accounts without tokens (earlier probe of 0.0.1000), never absent.

## Summary of fields ever null or missing

Never null and never missing in any sample (fields from the spec list):

- Transactions (mainnet 15 600; testnet 1000; previewnet 1000): `transaction_hash`, `consensus_timestamp`, `charged_tx_fee`, `nonce`, `result`, `name`, `transaction_id`, `transfers[].account` (about 41 000 slots), `staking_reward_transfers[].account` (109 slots mainnet), `token_transfers[].account` and `.token_id` (about 1 340 slots mainnet).
- Token rows (13 364 rows, 1049 accounts): `token_id`, `decimals`, `automatic_association`, `freeze_status`, `created_timestamp`, `balance`.
- Accounts (about 1 000 mainnet, 100 testnet, 3 previewnet): `account`, `evm_address`, `balance.balance`, `balance.timestamp`, `balance.tokens[].token_id`, `pending_reward`, `decline_reward`, including the 198 no-alias accounts and low numbers 1-1200.
- Historical staking accounts (30 current, 29/26/19/14 at the four past timestamps): `evm_address`, `balance.timestamp`, `pending_reward` never null or missing.
- Nodes (30 + 7 + 7): `node_account_id`, `min_stake`, `max_stake`, `stake_rewarded`, `reward_rate_start`, `description`, `stake` never null or missing.
- Contract results (600): `contract_id`, `block_hash`, `block_gas_used` never null or missing.

Ever null (all other keys were present, never missing):

- `parent_consensus_timestamp` (transactions): 9 527 of 10 800, 2 460 of 3 600, 1 200 of 1 200, testnet 1000 of 1000, previewnet 1000 of 1000. This is the normal value for top-level transactions.
- `gas_used` and `gas_consumed` (contract results): 250 of 600 each (same rows).
- `max_automatic_token_associations` (account): 14 of 119 low-number accounts (0.0.1-999), 1 of 300 recent accounts; 0 of 201 for 0.0.1000-1200 and 0 of 138 for 1201-100000.
- Not in the spec list but null: `alias` (nearly all old accounts), `staked_node_id` (not staking), `created_timestamp` on accounts (111 of 201 for 0.0.1000-1200; 51 of 119 low; 21 of 138; 36 of 300), transaction `entity_id` and `node`, contract result `error_message` (555 of 600).
- Historical `?timestamp=lt:` on staking accounts: `staked_node_id` null for 1/26, 4/19, 2/14 at 180/365/730 days; 404 for 1/30, 4/30, 11/30, 16/30 at 30/180/365/730 days (account did not exist yet).

Missing (key absent): none for any spec-list field. Every list page carried `links` and its array key.

Caveats: testnet and previewnet have almost no history and almost no HTS data (token-field result there is empty). Of the 4 xx responses, 75 were 404 (nonexistent accounts or historical lookups) and 3 were 400 on the first testnet/previewnet window run (cause not investigated; no data used from them). \`stake_total\` and \`address_book\` rows in section 6 were probes of names that are not Swagger fields.
