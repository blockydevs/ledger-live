# @ledgerhq/coin-tester-casper

Boots a local Casper 2.x network in Docker and checks that `@ledgerhq/coin-casper`
can read from it through its own API layer.

## Run

```sh
pnpm coin:tester:casper start
```

`DEBUG=1` streams docker compose output.

The signer test needs neither Docker nor RPC and runs on its own:

```sh
pnpm --filter @ledgerhq/coin-tester-casper exec jest src/signer.test.ts
```

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
| Native transfer cost | `[system_costs.mint_costs] transfer = 100_000_000` motes, exactly `CASPER_FEES_MOTES`. Measured on a real 10 CSPR transfer: `cost = consumed = limit = 100000000` |
| Fee economics | `pricing_handling = payment_limited`, `fee_handling = burn`, `refund_handling = refund 75%`, `min_gas_price = max_gas_price = 1` — the charge has no dynamic component |

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

## Signer

`signOperation` hands the signer `Transaction.toBytes()`, not a hash. A signature
over those bytes fails `validate()` with `invalid signature`. The bytes carry the
hash inside them: `toBytes()` is a calltable serialization —
`[u8 version][u32 field count][(u16 index, u32 offset) × N][u32 blob length][blob]`
— whose field 0 is the 32-byte hash and field 1 the payload, with
`blake2b256(field 1) === field 0`.

`src/signer.ts` reads the header, checks that identity, and signs field 0. The
result is byte-for-byte what `tx.sign(privateKey)` produces. The device app gets
the same bytes and derives the hash the same way, so `signOperation` needs no
change.

`CalltableSerialization` exists in casper-js-sdk but the package does not export
it from its single entry point (`dist/lib.node.js`), so the header parser is our
own. Offsets are read from the header, never assumed. They were measured on a
native transfer; other transaction shapes were not checked.

`derive --secret-key` prints a SEC1 `EC PRIVATE KEY` block with CRLF line
endings. `PrivateKey.fromPem` accepts it as printed and after `trim()`.
`publicKey.bytes()` returns the 34-byte tagged form, so the signer returns
`bytes().subarray(1)` — the module's resolver re-adds the `02` tag.

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

`src/devnet.test.ts` checks the infrastructure. `src/scenarii.test.ts` runs one
transfer from user 0 to user 1 through the full bridge path and asserts the OUT
operation on the sender and the IN operation on the recipient.

The two share one devnet, booted once by `src/globalSetup.ts` and torn down by
`src/globalTeardown.ts` for jest's `devnet` project. `devnet.test.ts` derives
`DEVNET_SANITY_USER_INDEX` (fixtures.ts) instead of the scenario's sender index,
so its exact genesis-balance assertion holds no matter which suite runs first.

Still out of scope: staking, and an indexer that reads the chain.

### What the indexer mock does and does not prove

`getAccountShape` reads balance and block height from the node RPC, but takes
operations only from the indexer. The devnet has no indexer, so `src/indexer.ts`
serves `accounts/<publicKey>/ledgerlive-deploys` from `msw` and indexes one
deploy under both parties' public keys, the way the real indexer does.

The entry's content comes from Ledger Live's own optimistic operation, not from
the chain. The scenario therefore checks how the indexer's shape maps to
operations. It does not check that indexer data agrees with the real
transaction, and the entry alone cannot detect a transaction the chain rejected.
Only the two balance assertions — the sender's drop and the recipient's gain —
detect that.

The scenario points `API_CASPER_INDEXER` at `http://casper-indexer.mock/`.
`src/devnet.test.ts` keeps `http://127.0.0.1:1/`, so an accidental `fetchTxs`
there fails fast on a dead port instead of hanging.

### Pinned module behaviour

These assertions record what `@ledgerhq/coin-casper` does today. They are not
statements about what is correct.

| Behaviour | Where |
| --- | --- |
| `fee` on both operations comes from the `CASPER_FEES_MOTES` constant (0.1 CSPR), never from the chain | `mapTxToOps` |
| `fee` is set on the IN operation too, although the recipient pays nothing | `mapTxToOps` |
| `blockHeight` is hardcoded to `1`; the scenario does not assert it | `mapTxToOps` |

Both balance assertions are equalities. The sender drops the operation's full
`value`, the recipient gains the bare `amount`. That works because the devnet
charges a flat fee for a native transfer, and it happens to equal the module's
constant — see the table above. The sender's equality therefore does double duty:
it waits for the chain to settle, and it pins `CASPER_FEES_MOTES` against the
chain's real cost. If an image bump changes that cost, this assertion fails, and
the module's hardcoded fee is what needs the fix.

`mapTxToOps` reads `txArgs.id` inside a `try` whose `catch` turns any error into
a warning and an empty operation list. If an entry lacks `args.id`, accessing it
throws a `TypeError`. `src/indexer.ts` declares its factory's return type as
`ITxnHistoryData`, where `args.id` is required, so the compiler guards that.
