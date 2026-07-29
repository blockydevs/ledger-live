import BigNumber from "bignumber.js";
import type { CasperCoinConfig } from "@ledgerhq/coin-casper/config";

export const DEVNET_SERVICE_NAME = "casper-devnet";

/** The bare host and `/` both return 404 — the sidecar serves RPC on `/rpc`. */
export const DEVNET_RPC_URL = "http://localhost:11101/rpc";

export const DEVNET_CHAIN_NAME = "casper";

/** Validators occupy derivation indices 0..n; users start at 100. */
export const USER_DERIVATION_INDEX_OFFSET = 100;

export const userDerivationPath = (index: number): string =>
  `m/44'/506'/0'/0/${USER_DERIVATION_INDEX_OFFSET + index}`;

/** Genesis prefunding for a user account. No faucet step is needed. */
export const GENESIS_USER_BALANCE_MOTES = new BigNumber("1e36");

/**
 * Port 1 refuses immediately. This package does not exercise the indexer, and
 * an explicitly dead URL makes an accidental fetchTxs fail fast and loudly
 * instead of hanging on a timeout.
 */
export const UNUSED_INDEXER_URL = "http://127.0.0.1:1/";

/** Mirrors `libs/ledger-live-common/src/families/casper/config.ts` with the infra URLs swapped. */
export const localCoinConfig: ReturnType<CasperCoinConfig> = {
  status: {
    type: "active",
    features: [
      { id: "blockchain_txs", status: "active" },
      { id: "staking_txs", status: "active" },
    ],
  },
  infra: {
    API_CASPER_NODE_ENDPOINT: DEVNET_RPC_URL,
    API_CASPER_INDEXER: UNUSED_INDEXER_URL,
  },
};
