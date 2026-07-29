# @ledgerhq/coin-tester-casper

Boots a local Casper 2.x network in Docker and checks that `@ledgerhq/coin-casper`
can read from it through its own API layer.

## Run

```sh
pnpm coin:tester:casper start
```

`DEBUG=1` streams docker compose output.

## What runs

`ghcr.io/veles-labs/casper-devnet` ships `casper-node` and `casper-sidecar` in one
asset bundle and supervises both from a single Rust binary. In Casper 2.x the node
does not serve JSON-RPC — the sidecar does — so a local network is node + sidecar
at matching versions.

Only JSON-RPC (`11101`) is published; REST (`14101`), SSE (`18101`) and the binary
port (`28101`) stay internal because the module uses none of them. State is
ephemeral: every run gets a fresh genesis.

## Verified contract of the pinned image

Re-measure this table on every image bump — the digest pin trades drift detection
for reproducibility.

| Property | Value |
| --- | --- |
| Image | `ghcr.io/veles-labs/casper-devnet:v0.10.1@sha256:c691d3f30e1c75c6366e80fa6e3be2baddae5fa0eaca07b91c1cefc3f87a39bc` |
| Platform | `linux/amd64` only — an arm64 host needs emulation |
| `api_version` / `build_version` | `2.0.0` / `2.2.0-057cf21` |
| JSON-RPC path | `http://localhost:11101/rpc` — bare host and `/` both 404 |
| `chainspec_name` | `casper`, matching `CASPER_NETWORK` |
| Derivation | secp256k1 over BIP32 `m/44'/506'/0'/0/<n>`; validators from 0, users from 100 |
| User public key | `02` tag + 33-byte compressed key = 68 hex chars |
| Genesis user balance | 1000000000000000000000000000000000000 motes — no faucet step |
| `state_get_balance` | still served, despite being deprecated in 2.x docs |
| `network <name> is-ready` | exit 0 = ready; exit 1 for both "not ready" and "assets not found" |
| Peak container memory | ~168 MiB (cgroup `memory.peak`, sampled across a full test-suite run) — 4 `casper-node` + 4 `casper-sidecar` processes, one sidecar per node |

`derive --secret-key` prints a multi-line, CRLF-terminated PEM block, not bare
hex; only `derive --public-key` and `derive --account-hash` print bare hex.

The account hash has two shapes depending on source: the raw RPC
`state_get_account_info` response prefixes it with `account-hash-`, while the
CLI's `derive --account-hash` prints it without the prefix. `fetchAccountStateInfo`
calls `.toHex()` on the RPC value, so the module's own return shape is the
unprefixed form, matching the CLI.

`docker-compose@1.1.0`'s `exec` splits a string command on whitespace with no
quote-awareness, so `src/casperDevnet.ts` passes the derive command as an
array — the derivation path contains `'` characters.

## Constraints

`--node-count` must be at least 4: `min_peers_for_initialization = 3` is baked into
the image's asset template with no override flag, and with N nodes each node sees at
most N−1 peers, so N ≤ 3 stalls in `reactor_state: "Initialize"`.

No `--chainspec-override`. Blocks land every ~3 s already, and
`core.minimum_era_height=1` crashes the node with `invalid chainspec` because
validation requires `signature_rewards_max_delay < minimum_era_height`. Era timing
only affects staking, which this package does not exercise.

The image is third-party and unaffiliated with Casper Labs.

## Scope

Infrastructure only: no signer, no `Scenario` wiring, no indexer mock, no staking.
`API_CASPER_INDEXER` points at `http://127.0.0.1:1/` so an accidental `fetchTxs`
fails fast instead of hanging.
