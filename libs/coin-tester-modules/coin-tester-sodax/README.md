# @ledgerhq/coin-tester-sodax

> [!NOTE]
> ICON is now named SODAX. The package name uses `sodax`. The coin module, the
> family string, and the currency id stay `icon`.

> [!WARNING]
> **This package is a harness, not a scenario.** It starts a local ICON devnet,
> serves the tracker REST API that `@ledgerhq/coin-icon` reads, and proves both
> parts answer. It builds no bridge, calls no `getAccountShape`, calls no
> `getEstimatedFees`, and runs no `Scenario`. CI reports a green
> `Coin Tester - sodax` leg for a package that does not run a transaction
> through the coin module. The leg proves the harness and the read path. A
> follow-up task adds the signer and the scenario.

## What it covers

`src/devnet.test.ts` holds the whole deliverable. It calls the four leaf
functions of `coin-icon` that throw on failure, plus raw RPC where no leaf
function exists.

| Assertion | Reads |
|---|---|
| Block height advances | `icx_getLastBlock` |
| Network id is `0x1` | `icx_getNetworkInfo` |
| Genesis balances | `icx_getBalance` |
| `getDelegation` answers on `cx…00` | `api/node.ts` |
| Block height through the tracker | `getCurrentBlockHeight` |
| Balance through the tracker | `getAccount` |
| One operation for a submitted transfer | `getOperations` |
| An unmocked external URL throws | msw |

`getAccountShape` and `getEstimatedFees` each catch every error. A dead indexer
then looks like an empty wallet, and an unreachable fee service returns a
constant. The suite calls neither function, so neither `catch` block can hide a
broken dependency.

A green run says the devnet answers every call the module makes, and that the
module's own HTTP clients accept the answers. It does not say the module maps
the answers correctly into an `Account`.

## What it does not cover

- The fee path. `getStepPrice` on `cx…01` and `debug_estimateStep` on
  `/api/v3d` need two devnet capabilities the image does not ship. `goloop
  server` preinstalls no governance SCORE and enables no debug API. A test that
  cannot reach its service asserts nothing.
- Send, send-max, and recipient-side behavior.

## Devnet image contract

The package builds its own image from `iconloop/goloop-icon:v1.4.4`. No
published image serves `gochain-icon`.

| Fact | Value |
|---|---|
| Binaries | `/goloop/bin/goloop` only |
| Governance artifact | `/goloop/icon_governance.zip` |
| JSON-RPC | port 9080, `/api/v3` |
| P2P | port 8080 |
| Engines | `python,java` |
| Platform | `linux/amd64` |

`coin-tester-goloop/entrypoint.sh` generates the genesis with goloop's own
tools, then patches three fields with `jq`:

1. `nid` moves to the top level of the file. goloop reads it from there. A `nid`
   under `chain` has no effect, and goloop then derives the nid from the genesis
   hash, which changes on every run.
2. `chain.fee.stepPrice`, which `--fee icon` leaves at `0x0`.
3. The god account's genesis balance, so the devnet funds a wallet the suite
   controls.

The entrypoint also funds `DEV_ADDRESS` when the variable is set, by adding a
second genesis account. The scenario task uses this seam.

## Usage

```bash
pnpm coin:tester:sodax start
```

Set `DEBUG=1` to stream the compose output.

## Package layout note

`package.json#main` points at `src/devnet.test.ts`. Every sibling points `main`
at `src/scenarii.test.ts`. The field is inert: the CI action runs
`pnpm coin:tester:sodax start`, and `start` globs `src/*.test.ts`. `main` moves
when the scenario lands.
