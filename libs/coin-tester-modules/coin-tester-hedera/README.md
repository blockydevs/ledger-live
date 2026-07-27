# @ledgerhq/coin-tester-hedera

End-to-end coin-tester scenarios for the **legacy** `@ledgerhq/coin-hedera` bridge: sync → craft →
status → sign → broadcast → re-sync → assert, against a real local Hedera network, signing with a
pure-software Ed25519 key (no Speculos, no device).

## Scope

Five scenarios, each on its own account funded from the genesis operator (`0.0.2`), all sharing a
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
5. **ERC20 transfer** (`scenarii/hederaErc20.ts`) — deploy `LedgerLiveTestToken` (see "The ERC20
   contract artifact" below), seed the account under test directly from the genesis operator, then
   send part of the balance through the bridge. See "ERC20 coverage" below for exactly what this
   asserts and what it doesn't — **this scenario has never been run in this environment** (no
   Kubernetes cluster available here); it is unexercised pending a cluster run.

All five sign with a pure-software Ed25519 key (no Speculos, no device) and follow the same loop:
sync → craft → status → sign → broadcast → re-sync → assert.

On top of the scenarios, `src/negativeCases.ts` (`describeNegativeCases()`, wired into the same
`describe("Hedera")` in `scenarii.test.ts`) asserts directly against `getTransactionStatus` —
without broadcasting — for cases a broadcast-based scenario can't cover: insufficient HBAR balance,
a malformed recipient accountId, an HTS transfer to an unassociated recipient (warning), an HTS
transfer above the held token balance, and (in a nested `describe("erc20 negative cases")`, its own
Solo contract deploy and its own msw server) an ERC20 transfer above the held token balance. That
nested block registers both an HTS token and an ERC20 token on the same account, which exercises
the `[...mirrorTokens, ...erc20Tokens]` merge in `coin-hedera/src/bridge/utils.ts` — an account
holding both kinds of token simultaneously is constructed there, but nothing in that block asserts
on the merge itself.

Out of scope (deferred): `ClaimRewards`, memo edge cases, and making `coin-hedera`'s hgraph
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
pattern. `indexer.ts` routes each request on `body.variables` (each of the three queries the fake
answers has a distinguishable shape) and then cross-checks the chosen branch against the query
text itself, so a routing/variables mismatch fails loudly instead of silently answering the wrong
query. The negative guarantee ("nothing external but the fake hgraph is hit") comes from the MSW
`onUnhandledRequest` throwing on any non-local, non-hgraph request — narrowed specifically to the
local mirror-node port (`LOCAL_MIRROR_NODE_PORT`), not all of localhost, so no other local traffic
is waved through unnoticed.

Making hgraph optional in `coin-hedera` itself (so this mock is unnecessary) is a separate,
deferred change — see the PR description for scope.

## The stateful hgraph fake

`src/hgraphFake.ts` doesn't invent data: it translates real responses from the Solo mirror node
into the hgraph GraphQL response shapes `coin-hedera` consumes, so the ERC20 scenario and negative
case are backed by an actual local network rather than fixed fixtures. It answers the three
queries `coin-hedera` sends, each on a different refresh model:

- **`erc_token_account` (balances) — live on every query.** `getErcTokenAccountRows` calls the
  mirror node's `/api/v1/contracts/call` (`balanceOf`) directly, once per registered token, on
  every request. No caching, no snapshot.
- **`erc_token_transfer` — a snapshot taken in `refresh()`.** `refresh()` re-scans every top-level
  `CONTRACTCALL` transaction from the mirror node, joins each to its logs, and decodes `Transfer`
  events into a frozen, sorted array (`transferSnapshot`). `getErcTokenTransferRows` only ever
  filters and paginates that frozen array — it never talks to the network itself. `refresh()` is
  called from the ERC20 scenario's `beforeSync` (which runs inside `executeScenario`'s retry loop,
  so a not-yet-indexed transfer gets picked up on a later attempt) and, in the negative-case block,
  explicitly before the manual sync since no `beforeSync` hook exists there.
- **`ethereum_transaction` (latest indexed timestamp) — live, with a floor.**
  `getLatestEthereumTransactionTimestamp` reads the mirror node's latest contract result and
  returns `max(that timestamp, wall clock)`. The floor exists because three scenarios — `hedera`,
  `hedera token` and `hedera staking` — share one Solo cluster and run *before* any ERC20 contract
  exists. Without it, `GET /api/v1/contracts/results?limit=1&order=desc` would return an empty
  list, and `coin-hedera`'s `getLatestIndexedConsensusTimestamp` would hit
  `invariant(..., "No transactions found in Hgraph")`, capsizing those three otherwise-green
  scenarios. The wall-clock floor also keeps the value from ever answering with a timestamp behind
  a call just made.

### A known `coin-hedera` pagination bug, deliberately reproduced rather than fixed

`getERC20Transfers` always calls with `fetchAllPages: true` and no explicit `order`, so
`getPaginationDirection(true, "desc")` returns `_gt` unconditionally while the query is actually
sorted `desc` — the cursor advances backwards through a `> cursor` filter, walking *away* from the
rows it should be paging into. For an account with more than 100 ERC20 transfers, that mismatch
would make the real client's pagination loop repeat the same page forever; the only thing that
would end it is a page short enough to look like the end of the data. This is a real bug in
`coin-hedera`, out of scope for this tester to fix (Global Constraint 1) — `hgraphFake.ts`
reproduces the real hgraph contract faithfully (`> cursor`, sorted desc, sliced to `limit`) rather
than defending against the caller's own `_gt`/`desc` mismatch. To keep that fidelity from turning
into a genuine infinite loop under test, the fake carries its own page counter
(`MAX_TRANSFER_PAGES`, reset by `refresh()`) and throws a named `HgraphFakeGuardError` after 50
pages — converting a hang into a diagnosable failure instead of a 6-minute Jest timeout with no
clue why.

## The ERC20 contract artifact

`src/fixtures/LedgerLiveTestToken.json` is committed **compiled-only** — bytecode and ABI, no
`.sol` file anywhere in the repo. A Solidity source file that CI never compiles would silently
drift from the bytecode sitting next to it, which is worse than not having the source checked in
at all. The full source and the exact `solc` invocation used to produce the artifact
(`solc-js 0.8.36`, `--optimize --bin --abi`) live in the artifact's own `origin` field, so
refreshing it is a matter of pasting that source into a `.sol` file and re-running the documented
command. The contract itself is deliberately minimal (`transfer`/`balanceOf`/`Transfer` event only,
no pause/owner/blacklist hooks) so nothing in it can fire unpredictably against the bridge under
test.

## ERC20 coverage

ERC20 support landed in this tester, but **it has never been run against a real Solo cluster in
this environment** — there is no Kubernetes host available here, so the ERC20 scenario
(`scenarii/hederaErc20.ts`) and the ERC20 negative case (`negativeCases.ts`'s
`describe("erc20 negative cases")`) are, as of this writing, unexercised beyond the unit tests
(`hgraphFake.test.ts`, `indexer.test.ts`) that don't need a cluster. Anyone picking this up should
run `pnpm coin:tester:hedera start` on a k8s-capable host before trusting that the scenario passes.

What the code does, honestly stated:

- **HTS — unchanged.** Association, send, send-max, multi-token auto-association, and the HTS
  negative cases all predate this work and are untouched by it.
- **ERC20 — covered by the new scenario and negative case:** contract deploy
  (`deployErc20Token`), seeding a balance from the genesis operator, a bridge-level send, the fee
  landing as its own `FEES` operation (ERC20 has no HTS equivalent — a plain HBAR-value transfer
  has none), balance validation (the ERC20 negative case), and a gas-estimate sanity check via an
  `extra.gasLimit` sentinel assertion (asserted `!= DEFAULT_GAS_LIMIT` and `> 0`, not against an
  upper bound — Solo's real intrinsic-cost overhead on top of the estimate is unmeasured).
- **Constructed but not asserted on:** the ERC20 negative-case block registers both an HTS token
  and an ERC20 token on the same account, which exercises the `[...mirrorTokens, ...erc20Tokens]`
  merge in `coin-hedera/src/bridge/utils.ts` (an account holding both kinds of token
  simultaneously) — but nothing in that block asserts anything about the merged result itself.
- **Still uncovered:** ERC20 send-max, a third party receiving an ERC20 transfer with no
  operations of its own on the account under test, and hgraph pagination beyond 100 transfers (see
  the pagination bug above).

## Unit tests for the harness itself

Unlike every sibling coin-tester, this package ships unit tests for its own harness:
`signer.test.ts`, `indexer.test.ts`, `solo.test.ts`, `fixtures.test.ts` and `hgraphFake.test.ts`.
The first two exist because the SDK's public-key encoding and the hgraph `invariant` are both
silent-failure modes that would otherwise only surface deep inside a 10-minute scenario run.
`solo.test.ts` guards `deploySolo()`'s memoisation, whose regression costs about 20 extra minutes
per run instead of failing loudly. `hgraphFake.test.ts` is the main non-cluster guarantee for the
whole ERC20 feature: it exercises the mirror-node → hgraph mapping directly — cursor slicing,
long-zero address decoding, zero-address mint/burn handling, and the `ethereum_transaction`
floor — all wrong-not-loud failure modes that would otherwise only show up as a confusing scenario
failure minutes into a cluster run. `pnpm start`'s `src/*.test.ts` glob picks them all up alongside
the scenario.

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
