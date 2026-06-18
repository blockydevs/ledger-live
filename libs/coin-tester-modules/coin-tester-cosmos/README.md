# @ledgerhq/coin-tester-cosmos

This package contains the deterministic testing infrastructure for Cosmos-SDK
chains in Ledger Live. The first scenario exercises Babylon (`BABY`), reusing
the cosmos coin module end to end.

## Features

- Deterministic Babylon (`BABY`) scenario covering send, delegate, and claim
  rewards end to end against a local node
- Babylon staking is `x/epoching`-wrapped; the wrapped **delegate** is exercised
  here. Wrapped **undelegate / redelegate** are crafted correctly but don't yet
  execute on the devnet (accepted into a block but no-op at the epoch boundary —
  see the note in `src/scenarii/Babylon.ts`), so they're omitted pending a
  follow-up investigation
- Local software signer written in TypeScript (matches the DMK signer's wire output)
- Docker-based two-validator `babylond` devnet (both validators are needed for
  consensus) with a short epoch interval for fast tests

## Usage

```typescript
import { executeScenario } from "@ledgerhq/coin-tester/main";
import { BabylonScenario } from "@ledgerhq/coin-tester-cosmos/scenarii/Babylon";

await executeScenario(BabylonScenario);
```

## Development

Run the scenario with `pnpm start`. The script spins up the Docker devnet, runs
the Jest test, then tears the devnet down.

### Devnet topology

`docker-compose.yml` brings up two `babylond` services that share a single
named volume:

- `babylond` (node 0) — exposes LCD (1317), Tendermint RPC (26657), gRPC (9090)
- `babylond-node1` — internal only, peers with node 0 over the compose network

`babylond testnet --v 2` splits voting power evenly between the two validators,
so both nodes must be online for Tendermint to reach the 2/3 quorum. node 0's
entrypoint runs the chain init (genesis, dev account, epoch interval, peer
discovery), then node 1 waits for the shared volume to be populated and starts.

### Why no mock indexer

For Cosmos chains, the local node's LCD already serves transaction history via
the standard REST endpoints, which `@ledgerhq/coin-cosmos`'s synchronisation
calls directly. There's no separate explorer to mock — pointing `lcd` at the
local node covers both broadcasting and history.

## Dependencies

- @ledgerhq/coin-tester
- @ledgerhq/coin-cosmos
- @ledgerhq/hw-app-cosmos
