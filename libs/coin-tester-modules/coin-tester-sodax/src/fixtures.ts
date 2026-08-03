import type { CoinConfig } from "@ledgerhq/coin-module-framework/config";
import type { IconCoinConfig } from "@ledgerhq/coin-icon/config";
import { convertICXtoLoop } from "@ledgerhq/coin-icon/logic";
import { getCryptoCurrencyById } from "@ledgerhq/ledger-wallet-framework/currencies";
import BigNumber from "bignumber.js";
import IconService from "icon-sdk-js";

const { IconWallet } = IconService;

// getNid() returns 1 for the `icon` currency. The devnet genesis carries the
// same nid, so no coin-module change is needed.
export const icon = getCryptoCurrencyById("icon");

export const GOLOOP_RPC = "http://127.0.0.1:9080/api/v3";
export const GOLOOP_DEBUG_RPC = "http://127.0.0.1:9080/api/v3d";

// This host does not resolve, so the msw double can never reach a real service.
export const INDEXER_URL = "http://indexer.sodax.local/api/v1";

// Devnet keys. They control no real funds.
export const GOD_PRIVATE_KEY = "1cd7d9f4e0e0a53e0dbcdd1e07b25a6ee3ded4d1e0a4c9f2b6a8d3c5e7f10123";
export const DEV_PRIVATE_KEY = "2b8ac1e5d3f60729c4a1b0e8d7f2a3641c9e0b5d8a7f6e3c2d1b0a9f8e7d6c5b";

export const godWallet = IconWallet.loadPrivateKey(GOD_PRIVATE_KEY);
export const devWallet = IconWallet.loadPrivateKey(DEV_PRIVATE_KEY);

export const GOD_ADDRESS = godWallet.getAddress();
export const DEV_ADDRESS = devWallet.getAddress();

export const GENESIS_BALANCE_ICX = new BigNumber(1_000_000);
export const GENESIS_BALANCE_LOOP = convertICXtoLoop(GENESIS_BALANCE_ICX);
export const GENESIS_BALANCE_HEX = `0x${GENESIS_BALANCE_LOOP.toString(16)}`;

// ICON mainnet step price, 12.5 Gloop.
export const STEP_PRICE_LOOP = new BigNumber(12_500_000_000);
export const STEP_PRICE_HEX = `0x${STEP_PRICE_LOOP.toString(16)}`;

export const localConfig: IconCoinConfig = {
  status: { type: "active" },
  infra: {
    indexer: INDEXER_URL,
    indexer_testnet: INDEXER_URL,
    node_endpoint: GOLOOP_RPC,
    node_testnet_endpoint: GOLOOP_RPC,
    debug_endpoint: GOLOOP_DEBUG_RPC,
    debug_testnet_endpoint: GOLOOP_DEBUG_RPC,
  },
};

export const coinConfigFactory: CoinConfig<IconCoinConfig> = () => localConfig;
