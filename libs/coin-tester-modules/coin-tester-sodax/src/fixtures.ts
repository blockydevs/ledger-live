import type { CoinConfig } from "@ledgerhq/coin-module-framework/config";
import type { IconCoinConfig } from "@ledgerhq/coin-icon/config";
import type { IconAccount } from "@ledgerhq/coin-icon/types/index";
import { convertICXtoLoop } from "@ledgerhq/coin-icon/logic";
import { decodeAccountId } from "@ledgerhq/ledger-wallet-framework/account/index";
import { getCryptoCurrencyById } from "@ledgerhq/ledger-wallet-framework/currencies";
import {
  getDerivationScheme,
  runDerivationScheme,
} from "@ledgerhq/ledger-wallet-framework/derivation";
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

// GOD_PRIVATE_KEY only funds genesis; it controls no real funds and stays
// fixed across runs. The dev and recipient wallets are generated fresh per
// run in the scenario's setup(), so signing and address derivation are
// exercised for real rather than hardcoded.
export const GOD_PRIVATE_KEY = "1cd7d9f4e0e0a53e0dbcdd1e07b25a6ee3ded4d1e0a4c9f2b6a8d3c5e7f10123";

export const godWallet = IconWallet.loadPrivateKey(GOD_PRIVATE_KEY);
export const GOD_ADDRESS = godWallet.getAddress();

export const GENESIS_BALANCE_ICX = new BigNumber(1_000_000);
export const GENESIS_BALANCE_LOOP = convertICXtoLoop(GENESIS_BALANCE_ICX);
export const GENESIS_BALANCE_HEX = `0x${GENESIS_BALANCE_LOOP.toString(16)}`;

// Measured against this devnet: a plain ICX transfer (no data) always uses
// exactly this many steps under the `--fee icon` step-cost table.
export const TRANSFER_STEP_COUNT = new BigNumber(1_000_000);
// The governance SCORE's on_install fixes the step price at this value; see
// entrypoint.sh.
export const STEP_PRICE = new BigNumber(10_000_000_000);
export const TRANSFER_FEE_LOOP = TRANSFER_STEP_COUNT.multipliedBy(STEP_PRICE);

// The keystore password matches KEYSTORE_PASSWORD in entrypoint.sh, the key
// that decrypts the god wallet for the governance deploy.
export const GOD_KEYSTORE_JSON = JSON.stringify(godWallet.store("gochain"));

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

/** A freshly generated wallet, distinct on every call. */
export function createRandomWallet(): ReturnType<typeof IconWallet.create> {
  return IconWallet.create();
}

export function makeIconAccount(address: string): IconAccount {
  const id = `js:2:icon:${address}:`;
  const { derivationMode, xpubOrAddress } = decodeAccountId(id);
  const scheme = getDerivationScheme({ derivationMode, currency: icon });
  const index = 0;
  const freshAddressPath = runDerivationScheme(scheme, icon, {
    account: index,
    node: 0,
    address: 0,
  });

  return {
    type: "Account",
    xpub: xpubOrAddress,
    subAccounts: [],
    seedIdentifier: xpubOrAddress,
    used: true,
    swapHistory: [],
    id,
    derivationMode,
    currency: icon,
    index,
    nfts: [],
    freshAddress: xpubOrAddress,
    freshAddressPath,
    balance: new BigNumber(0),
    spendableBalance: new BigNumber(0),
    operationsCount: 0,
    operations: [],
    pendingOperations: [],
    lastSyncDate: new Date(),
    blockHeight: 0,
    creationDate: new Date(),
    balanceHistoryCache: {
      HOUR: { latestDate: null, balances: [] },
      DAY: { latestDate: null, balances: [] },
      WEEK: { latestDate: null, balances: [] },
    },
    iconResources: {
      nonce: 0,
      votingPower: new BigNumber(0),
      totalDelegated: new BigNumber(0),
    },
  };
}
