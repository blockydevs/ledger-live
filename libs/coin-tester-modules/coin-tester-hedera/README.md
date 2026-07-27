# @ledgerhq/coin-tester-hedera

End-to-end coin-tester scenarios for the **legacy** `@ledgerhq/coin-hedera` bridge: sync → craft →
status → sign → broadcast → re-sync → assert, against a real local Hedera network, signing with a
pure-software Ed25519 key (no Speculos, no device).

## Scope

Four scenarios, each on its own account funded from the genesis operator (`0.0.2`), all sharing a
single Solo deployment, plus a bridge-level negative-cases block:

1. **Native HBAR sends** (`scenarii/hedera.ts`) — send 1 HBAR to an existing recipient; send 1 HBAR
   with a memo (asserts the memo round-trips through sync); send to a never-funded ED25519 alias to
   exercise Hedera's auto-account-creation; send max (drains the account).
2. **HTS association and transfer** (`scenarii/hederaToken.ts`) — associate a locally minted
   fungible token through the bridge, inject a treasury transfer, then send part of the balance to
   a separate, pre-associated fixture account, and finally send max (drains the sub-account).
3. **Delegate and undelegate** (`scenarii/hederaStaking.ts`) — stake to Solo's consensus node, then
   unstake.
4. **Multiple HTS tokens via auto-association** (`scenarii/hederaMultiToken.ts`) — two tokens land
   on the account via auto-association (no explicit `associate` transaction), then a plain HBAR send
   is asserted to leave both token sub-accounts untouched.

All four sign with a pure-software Ed25519 key (no Speculos, no device) and follow the same loop:
sync → craft → status → sign → broadcast → re-sync → assert.

On top of the scenarios, `src/negativeCases.ts` (`describeNegativeCases()`, wired into the same
`describe("Hedera")` in `scenarii.test.ts`) asserts directly against `getTransactionStatus` —
without broadcasting — for cases a broadcast-based scenario can't cover: insufficient HBAR balance,
a malformed recipient accountId, an HTS transfer to an unassociated recipient (warning), and an HTS
transfer above the held token balance.

Out of scope (deferred): ERC20 transfers, `ClaimRewards`, and making `coin-hedera`'s hgraph
dependency optional. CI wiring is now partially done — see "CI" below.

## Running locally

Requires a Kubernetes >= v1.32.2 capable host (kind + kubectl + helm). Hiero Solo
(`@hiero-ledger/solo`) deploys a single-node cluster running the consensus node, mirror node,
JSON-RPC relay and explorer all as pods inside one container. Under Solo 0.83's small-memory profile
a full run peaks around ~4 GB RAM (measured on the local suite: kind container ~3.8 GiB RSS,
consensus-node Java heap capped at 256M, kube-apiserver at 300Mi); budget ~6 GB free for headroom.
The small-memory profile is on by default and passing `--values-file` would disable it, so don't.

```bash
pnpm coin:tester:hedera start
```

Cold start is ~7–10 minutes. That budget is split in two: cluster bring-up runs in the suite's
`beforeAll` under its own `CLUSTER_BRING_UP_TIMEOUT_MS` (15 minutes), separate from the per-test
`jest.setTimeout(360_000)` (6 minutes) — deploy is no longer inside a test, so a hung scenario now
fails in 6 minutes instead of being charged against, or hidden by, the cluster's own budget.
`teardown` runs unconditionally after every run (deploy + destroy every time — no persistence, by
design, to match every other coin-tester package in this workspace).

The cluster is brought up once in the suite's `beforeAll` and torn down in its `afterAll`. No
scenario (and no negative case) may tear it down — doing so would leave the remaining scenarios
talking to a deleted pod.

## Solo's undeclared `reflect-metadata` and `protobufjs` dependencies

Solo bare-imports `reflect-metadata` in its `dist/src/index.js` (it needs the polyfill for
`tsyringe-neo`'s decorator-based DI), but **no published version declares it** — 0.57.0 through
0.83.0 all omit it from `dependencies`, `peerDependencies` and `optionalDependencies`, and
`tsyringe-neo` doesn't pull it in either. It only works upstream because flat npm/yarn layouts hoist
it. Under pnpm's strict layout Solo fails immediately with `ERR_MODULE_NOT_FOUND: reflect-metadata`,
before it ever reaches the cluster. `protobufjs` has the same undeclared-dependency shape (a
transitive Solo/Hedera-SDK need that isn't in anyone's manifest) and fails the same way under pnpm's
strict layout, so it gets the same treatment.

The fix is a `pnpm.packageExtensions` entry in the **root `package.json`**, declaring both
dependencies on Solo's behalf:

```json
"@hiero-ledger/solo": {
  "dependencies": {
    "reflect-metadata": "^0.2.2",
    "protobufjs": "^8.0.1"
  }
}
```

Notes for whoever touches this next:

- The key is deliberately **unversioned**. Every published version is affected, so pinning it to one
  (e.g. `@hiero-ledger/solo@0.68.0`) would make the extension silently stop applying on the next
  bump, reproducing the original error with no clue as to why.
- Root `package.json` already has a `packageExtensions` block — merge into it. Adding a second key
  of the same name is silently discarded by JSON's last-key-wins semantics.
- After editing, `rm -rf node_modules/.pnpm/@hiero-ledger+solo*` and `pnpm install --force`. A plain
  `pnpm install` reports "Lockfile is up to date" and skips re-resolving the extension.

Every failure mode above is silent, which is what makes this expensive to rediscover. The upstream
fix is a one-liner in Solo's own `package.json`; once it lands, this entry can be dropped.

## Solo leaks its port-forwards

Solo exposes the consensus node (`35211`) and mirror node (`38081`) with `--force-port-forward`,
spawning `persist-port-forward.js` / `kubectl port-forward` as **detached** processes. `solo one-shot
falcon destroy` tears down cluster resources only, and jest's `--forceExit` can't reach them either —
they survive every run, including green ones, reparented to init.

Left alone they don't just occupy the ports: the next run can connect to a tunnel pointing at a
deleted pod and time out, which reads as a Hedera/consensus-node failure rather than as leftover
state. That misdiagnosis is expensive.

`solo.ts` calls `killPortForwards()` **only after `destroy`**, not before `deploy` — deliberately.
Like every sibling coin-tester, bring-up only starts things; teardown is where cleanup lives. A
SIGKILL/OOM/power-loss run bypasses `teardownSolo()` entirely and can leave both the deployment and
its port-forwards behind; recover by hand with
`solo one-shot falcon destroy --deployment coin-tester-hedera` (this also clears the namespace so
the next `deploy --quiet-mode` doesn't reject it). `killPortForwards()` itself is best-effort and
namespace-scoped — see the comments in `solo.ts` for why it targets `pgrep`/`kill` rather than the
more obvious `pkill -f`. It is a no-op on Windows; clean up by hand there if the next run can't bind.
Arguably Solo's own `destroy` should do this — the same "worth an upstream issue" caveat as
`reflect-metadata` above.

## The hgraph limitation

`coin-hedera` calls the closed-source, commercial `hgraph.io` GraphQL indexer unconditionally on
every sync (`getERC20BalancesForAccountV2`, `getLatestIndexedConsensusTimestamp`). hgraph has no
open-source server and cannot be booted locally, so this package mocks it via MSW (`src/indexer.ts`)
rather than hitting a real instance. The mock is an *observer*, not a hard assertion on hgraph's
query shape — asserting that shape would couple this tester to `coin-hedera`'s internal query
pattern. The negative guarantee ("nothing external but the fake hgraph is hit") comes from the
MSW `onUnhandledRequest` throwing on any non-local, non-hgraph request.

Making hgraph optional in `coin-hedera` itself (so this mock is unnecessary) is a separate,
deferred change — see the PR description for scope.

## Unit tests for the harness itself

Unlike every sibling coin-tester, this package ships unit tests for its own harness:
`signer.test.ts`, `indexer.test.ts` and `solo.test.ts`. The first two exist because the SDK's
public-key encoding and the hgraph `invariant` are both silent-failure modes that would otherwise
only surface deep inside a 10-minute scenario run. `solo.test.ts` guards `deploySolo()`'s
memoisation, whose regression costs about 20 extra minutes per run instead of failing loudly.
`pnpm start`'s `src/*.test.ts` glob picks them up alongside the scenario.

## CI

`hedera` is listed in `.github/workflows/test-coin-tester.yml`'s `COIN_TESTER_CURRENCIES`, so it
enters the matrix. The whole `coin-tester` job moved from `public-ledgerhq-shared-small` to
`ledger-live-linux-8CPU-32RAM`, because the Hedera leg brings up a local kind cluster that the shared
small runner cannot host (~4 GB RAM peak, see "Running locally" above).

No tooling-install step is needed, and adding one would be wasted work: Solo ships a
`DependencyManager` per binary (`dist/src/core/dependency-managers/` covers kubectl, kind, helm,
crane, podman) and resolves each one in the order *its own `~/.solo/bin`* → *`PATH`, but only if the
version matches what Solo pins* → *download from the upstream release URL*. A pre-installed binary of
the wrong version is simply ignored and re-downloaded, so `helm/kind-action` and friends buy nothing.
What the runner **does** have to provide is a working container engine (Docker or Podman) for kind to
create the cluster in — that is an image-level prerequisite, not something a workflow step can fix.

The job still sets `continue-on-error: true`, so a red Hedera leg won't block a PR while this is
being shaken out.

Note that the matrix filter matches chains with `grep -qw "$coin"` against the affected paths. Since
`-` is not a word character, `hedera` matches every `libs/coin-modules/coin-hedera/**` path, so any
change to the coin module schedules this leg. That is intended: the tester exists to guard exactly
those changes.

`pnpm coin:tester:hedera start` on a suitable local host remains the fastest way to iterate without
waiting on CI.
