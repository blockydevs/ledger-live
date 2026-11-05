# @ledgerhq/coin-tester-xrp

> [!NOTE]
> **Status: STABLE** — Production-ready; API is considered stable.

Deterministic integration tester for the XRP family. It starts a local xrpld node in standalone mode in Docker. It runs XRP, IOU and MPT scenarios through the coin-framework bridge that ships in production.

## Run

```sh
pnpm coin:tester:xrp start
```

Requires a running Docker daemon. Jest starts xrpld once for all test files and stops it at the end.

## Devnet

The node is `xrplf/xrpld:3.4.1`, pinned by digest. `rippled.cfg` enables at genesis every amendment that is on XRPL Mainnet and is not on by default in 3.4.1, `MPTokensV1` included. `Clawback` is always on in 3.4.1.

Issuer and holder set-up transactions (`src/local-tx.ts`) sign in-process and go to xrpld directly, not through `coin-xrp`.

## Coverage

### XRP Payments (`src/scenarii/xrp.ts`)

| # | Transaction | Asserts |
| --- | --- | --- |
| 1 | Send 10 XRP to a fresh recipient (creates the account) | exercises the "destination not created" branch — accepted because amount == base reserve. Asserts `OUT`, recipient matches, fee == 10 drops. |
| 2 | Send 1 XRP to the now-existing recipient | sub-reserve transfer to the same account. |
| 3 | Send 15 XRP with destination tag | tag carried in the payload. |
| 4 | Send 13.9 XRP (drains to ~reserve) | balance lands just above the 10 XRP base reserve. `useAllAmount` would be the natural expression, but `coin-xrp`'s `validateIntent` does not recompute amount for it (echoes the input), so a concrete amount is used instead. |

### IOU tokens (`src/scenarii/xrpIou.ts`)

One issuer issues `USD` and `usd`, two codes that differ only by case. The issuer sets a 25 % transfer rate and allows clawback.

| # | Transaction | Asserts |
| --- | --- | --- |
| 1 | Opt in to `USD` | `OPT_IN` on the parent account, one sub-account at 0. |
| 2 | Opt in to `usd` | a second sub-account. The `USD` sub-account does not change. |
| 3 | Send 10 `USD` | one `IN` op for each issued token, from the issuer to the holder only, with the issued value. The `OUT` value is 12.5, transfer fee included. The recipient line holds 10. |
| 4 | Send max `USD` after a clawback of 5 | the clawback shows as an `OUT` to the issuer. The send empties the sub-account. |
| 5 | Send 10 `usd` after an opt-out of `USD` made outside Ledger Live | `OPT_OUT` on the parent account. The `USD` history stays. |
| 6 | Send max `usd` to the issuer | the issuer pays no transfer rate: the `OUT` value is 37.5 and the line holds 0. |
| 7 | Opt out of `usd` through Ledger Live | one `OPT_OUT` on the parent account, 10 drops. The line is deleted. The `usd` sub-account stays at 0 with its history and without `xrpResources`. |

Each send also asserts the `FEES` op on the parent account: one new op, 10 drops, with the token `OUT` op as its only sub-operation. Each token op names exactly one sender and one recipient.

### MPT tokens (`src/scenarii/xrpMpt.ts`)

One issuer creates issuance A, with a 25 % transfer fee and clawback, and issuance B, with neither. The steps are the same as the IOU scenario: opt in to A and B, send A, send max A after a clawback, send B after an opt-out of A made outside Ledger Live, send max B to the issuer, opt out of B through Ledger Live. B has no transfer fee, so only the IOU scenario shows that a payment to the issuer pays no fee.

### Refused sends (`src/negativeCases.test.ts`)

Each case asserts the `coin-xrp` status error. For a freeze or a lock, it also asserts the synced sub-account: the full balance, a spendable balance of 0 and `xrpResources.isLocked`. Each case also asserts that the signer was not called and that the account `Sequence` did not change.

| Token | Cases |
| --- | --- |
| IOU | frozen line, deep frozen line, globally frozen issuer, frozen line paying the issuer (no error), recipient without a trust line, recipient limit too low, amount plus transfer rate above the balance, recipient account missing, destination tag required |
| MPT | locked holder, locked issuance, locked holder paying the issuer (no error), recipient without an MPToken, locked recipient, amount plus transfer fee above the balance, issuance without `CanTransfer` |

### Token standards (`src/tokenStandards.test.ts`)

The holder holds `USD`, `usd` and one MPT. Only `USD` and the MPT are in the token store.

- The token store stub returns a token only when network, issuer and reference are equal, case included.
- With `enabledTokenStandards` unset, the account has no sub-account.
- With `["iou"]`, the account has only the `USD` sub-account.
- With `["iou","mpt"]`, the account has the `USD` and MPT sub-accounts.

## Layout

| File | Role |
| --- | --- |
| `src/rippled.ts` | `docker compose` lifecycle, in-process wallets, sign and submit, `ledger_accept` advance, trust line and MPToken reads |
| `src/globalSetup.ts`, `src/globalTeardown.ts` | start xrpld once before all test files, stop it after |
| `src/local-tx.ts` | issuer and holder transactions: trust lines, flags, transfer rate, issue, freeze, clawback, MPT issuance, authorize, lock |
| `src/tokens.ts` | token store stub and token factories. Ids follow the CAL: `ripple/iou/<40-hex code>:<issuer>`, `ripple/mpt/<issuance id>:<issuer>`, lowercase |
| `src/signer.ts` | Software secp256k1 signer (`ripple-keypairs`) implementing `XrpSigner` |
| `src/helpers.ts` | bridges keyed by the `xrp` family, local `ripple` config with `enabledTokenStandards`, account sync |
| `src/fixtures.ts` | Currency, recipient, account factory |
| `src/scenarii/*.ts` | XRP, IOU and MPT scenarios |
| `src/scenarii/shared.ts` | token send assertions shared by the IOU and MPT scenarios |
| `rippled.cfg` | Admin JSON-RPC :5005, admin WS :6006, genesis amendments |
| `docker-compose.yml` | xrpld standalone service |

## Limitations

Escrow, checks, AMM and multisig are not exercised.

`coin-xrp` keeps a short-lived in-memory recipient cache; if this scenario becomes flaky when sending to a freshly-created account, consider bypassing the cache in the test setup (test-only) so pre-flight checks always hit `account_info` directly.
