# @ledgerhq/coin-tester-sodax

> [!NOTE]
> ICON is now named SODAX. The package name uses `sodax`. The coin module, the
> family string, and the currency id stay `icon`.

This package runs a Ledger Live scenario against a local ICON devnet: it
builds the coin module's bridges with a software signer, sends ICX between two
freshly generated accounts, and checks that `listOperations` reports each
transfer correctly on both the sender and recipient side.

## What it covers

`src/scenarii/sodax.ts` sends three ICX transfers from a genesis-funded dev
account to a fresh recipient account. Each transfer asserts:

| Assertion | Checks |
|---|---|
| Operation count | Exactly one new OUT operation per transfer |
| `hasFailed` | The transaction landed, not just broadcast |
| Fee | Matches the step price and step count measured against this devnet |
| Value | `fee + amount`, matching the account's balance delta |
| Senders / recipients | Exact address match, both sides |

`afterAll` re-syncs the recipient account independently and checks its
operation count, type, and exact balance.

`src/signer.test.ts` checks `buildIconSigner` without a devnet: address
derivation through coin-icon's resolver, a signature `secp256k1` verifies
against the recovered public key, and rejection of a tampered payload.

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
second genesis account. The scenario's `setup()` generates a fresh dev wallet
per run and sets `DEV_ADDRESS` before the devnet starts, so the genesis funds
that wallet.

## Usage

```bash
pnpm coin:tester:sodax start
```

Set `DEBUG=1` to stream the compose output.
