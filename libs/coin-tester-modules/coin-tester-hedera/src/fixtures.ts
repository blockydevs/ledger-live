import BigNumber from "bignumber.js";
import type { TokenCurrency } from "@ledgerhq/types-cryptoassets";
import { setCryptoAssetsStore } from "@ledgerhq/ledger-wallet-framework/cryptoAssetsStore";
import { getCryptoCurrencyById } from "@ledgerhq/ledger-wallet-framework/currencies";
import {
  encodeAccountId,
  decodeAccountId,
} from "@ledgerhq/ledger-wallet-framework/account/accountId";
import {
  getDerivationScheme,
  runDerivationScheme,
} from "@ledgerhq/ledger-wallet-framework/derivation";
import type { HederaAccount } from "@ledgerhq/coin-hedera/types";

export const HEDERA = getCryptoCurrencyById("hedera");

/** Local Solo's consensus endpoint; the port can differ between Solo versions. */
export const LOCAL_CONSENSUS_NODES: Record<string, string> = { "127.0.0.1:35211": "0.0.3" };
export const LOCAL_MIRROR_NODE_URL = "http://127.0.0.1:38081";
/** Port Solo's mirror node listens on; derived so it tracks LOCAL_MIRROR_NODE_URL if it ever drifts. */
export const LOCAL_MIRROR_NODE_PORT = new URL(LOCAL_MIRROR_NODE_URL).port;

export const GENESIS_ACCOUNT_ID = "0.0.2";

/** Canonical genesis operator key of a local Hedera network — a public constant, not a secret. */
export const GENESIS_OPERATOR_KEY =
  "302e020100300506032b65700422042091132178e72057a1d7528025956fe39b0b847f200ab59b2fdd367017f3087137";

/**
 * Fake hgraph URL served only by indexer.ts's MSW handler; coin-hedera calls hgraph unconditionally.
 * A `.mock` domain that resolves nowhere — if a request ever escapes the MSW handler it fails
 * instantly and locally instead of leaving the machine (unlike a localhost port, which the msw
 * carve-out for the real mirror node would otherwise wave through).
 */
export const FAKE_HGRAPH_URL = "https://hedera-coin-tester.mock/hgraph";

/** An existing Solo-funded account used only as the send recipient; its key is never needed. */
export const RECIPIENT = "0.0.1002";

export function makeHederaAccount(accountId: string, publicKey: string): HederaAccount {
  const id = encodeAccountId({
    type: "js",
    version: "2",
    currencyId: HEDERA.id,
    xpubOrAddress: accountId,
    derivationMode: "hederaBip44",
  });
  const { derivationMode } = decodeAccountId(id);
  const scheme = getDerivationScheme({ derivationMode, currency: HEDERA });
  const freshAddressPath = runDerivationScheme(scheme, HEDERA, {});

  return {
    type: "Account",
    id,
    seedIdentifier: publicKey,
    derivationMode,
    index: 0,
    freshAddress: accountId,
    freshAddressPath,
    used: false,
    balance: new BigNumber(0),
    spendableBalance: new BigNumber(0),
    creationDate: new Date(),
    blockHeight: 0,
    currency: HEDERA,
    operationsCount: 0,
    operations: [],
    pendingOperations: [],
    lastSyncDate: new Date(0),
    balanceHistoryCache: {
      HOUR: { latestDate: null, balances: [] },
      DAY: { latestDate: null, balances: [] },
      WEEK: { latestDate: null, balances: [] },
    },
    swapHistory: [],
    subAccounts: [],
  };
}

export const TOKEN_DECIMALS = 2;
export const TOKEN_SYMBOL = "LLT";
export const TOKEN_UNIT = 10 ** TOKEN_DECIMALS;

export const ONE_HBAR_IN_TINYBAR = 100_000_000;

/** Headroom above any scenario's token count — deliberately NOT the -1 "unlimited" sentinel. */
export const MAX_AUTO_ASSOCIATIONS = 10;

/** Stubbed HBAR/USD rate. Fee estimates derive from it, so no assertion may depend on its value. */
export const HBAR_USD_RATE = 0.1;

/** A `TokenCurrency` for a locally-minted token; `contractAddress` must be the mirror-node `token_id`. */
export function makeLocalHtsToken(tokenId: string): TokenCurrency {
  return {
    type: "TokenCurrency",
    id: `hedera/hts/${tokenId}`,
    contractAddress: tokenId,
    parentCurrencyId: HEDERA.id,
    tokenType: "hts",
    name: "Ledger Live Test Token",
    ticker: TOKEN_SYMBOL,
    units: [{ name: "Ledger Live Test Token", code: TOKEN_SYMBOL, magnitude: TOKEN_DECIMALS }],
  };
}

/** A `TokenCurrency` for the locally-deployed ERC20 fixture; `contractAddress` must be the `0x`-prefixed EVM address. */
export function makeLocalErc20Token(evmAddress: string): TokenCurrency {
  const contractAddress = evmAddress.toLowerCase();
  return {
    type: "TokenCurrency",
    id: `hedera/erc20/${contractAddress}`,
    contractAddress,
    parentCurrencyId: HEDERA.id,
    tokenType: "erc20",
    name: "Ledger Live Test Token",
    ticker: TOKEN_SYMBOL,
    units: [{ name: "Ledger Live Test Token", code: TOKEN_SYMBOL, magnitude: TOKEN_DECIMALS }],
  };
}

export function installCryptoAssetsStore(tokens: TokenCurrency[]): void {
  const byAddress = new Map(tokens.map(t => [t.contractAddress.toLowerCase(), t]));
  const byId = new Map(tokens.map(t => [t.id, t]));

  setCryptoAssetsStore({
    findTokenById: async (id: string) => byId.get(id),
    findTokenByAddressInCurrency: async (address: string, currencyId: string) =>
      currencyId === HEDERA.id ? byAddress.get(address.toLowerCase()) : undefined,
    getTokensSyncHash: async () => "",
  });
}
