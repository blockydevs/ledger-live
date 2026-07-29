import BigNumber from "bignumber.js";
import { encodeAccountId } from "@ledgerhq/ledger-wallet-framework/account";
import { getCryptoCurrencyById } from "@ledgerhq/ledger-wallet-framework/currencies";
import {
  getDerivationScheme,
  runDerivationScheme,
} from "@ledgerhq/ledger-wallet-framework/derivation";
import { TRANSACTION_TYPE } from "@ledgerhq/coin-aleo/constants";
import type { AleoAccount, AleoCoinConfig } from "@ledgerhq/coin-aleo/types";
import { loadAleoWasm } from "./wasm";

/** REST endpoint the devnode serves. */
export const ALEO_LOCAL_NODE = "http://127.0.0.1:3030";

/** The network devnode runs; also the path segment in every REST route. */
export const ALEO_NETWORK_TYPE = "testnet";

/** SDK backend base; same network segment the devnode uses. */
export const ALEO_LOCAL_SDK = `http://127.0.0.1:3031/network/${ALEO_NETWORK_TYPE}`;

/**
 * Origin the tester points `apiUrls.node` at.
 *
 * Deliberately not localhost: MSW's `onUnhandledRequest` lets 127.0.0.1 through
 * so the real SDK backend stays reachable, which means an unhandled node route
 * on localhost would silently hit the devnode instead of failing.
 */
export const ALEO_FAKE_NODE = "http://aleo-node.test";

/**
 * The devnode's genesis account — the only prefunded one, and the account
 * scenarios fund from.
 *
 * `leo devnode start` takes a single `--private-key` and builds genesis around
 * it, so unlike a `leo devnet` (four committee members, each holding a share of
 * the supply) there is exactly one spendable balance here. This is the key leo
 * itself recommends for local use; the Dockerfile passes the same one.
 *
 * `assertGenesisAccountIsFunded` re-reads the balance from the running node
 * before any scenario spends from it, so a change in how devnode seeds genesis
 * fails loudly instead of silently funding nothing.
 */
export const GENESIS_ACCOUNT = {
  privateKey: "APrivateKey1zkp8CZNn3yeCseEtxuVPbDCwSyhGW6yZKUYKfgXmcpoGPWH",
  viewKey: "AViewKey1mSnpFFC8Mj4fXbK5YiWgZ3mjiV8CxA79bYNa8ymUpTrw",
  address: "aleo1rhgdu77hgyqd3xjj8ucu3jj9r2krwz6mnzyd80gncr5fxcwlh5rsvzp9px",
} as const;

/** Public microcredits held by `address`; 0 when the account is unknown. */
export async function getPublicBalance(address: string): Promise<bigint> {
  const response = await fetch(
    `${ALEO_LOCAL_NODE}/${ALEO_NETWORK_TYPE}/program/credits.aleo/mapping/account/${address}`,
  );
  if (!response.ok) {
    throw new Error(`Could not read the balance of ${address}: HTTP ${response.status}`);
  }

  // A miss returns the JSON literal `null`; a hit returns a quoted `"<n>u64"`.
  const value = (await response.json()) as string | null;
  return value === null ? 0n : BigInt(value.replace(/u64$/, ""));
}

/**
 * Fails if the pinned genesis account holds nothing, which is what makes
 * hardcoding it safe.
 */
export async function assertGenesisAccountIsFunded(): Promise<void> {
  const balance = await getPublicBalance(GENESIS_ACCOUNT.address);

  if (balance <= 0n) {
    throw new Error(
      `The pinned genesis account ${GENESIS_ACCOUNT.address} holds no credits. ` +
        "devnode likely changed how it seeds genesis from --private-key; " +
        "re-derive the account before spending.",
    );
  }
}

/**
 * The scenario's recipient: unknown to the chain at scenario start, so the
 * credits.aleo/account mapping returns `null` for it and `getPublicBalance`
 * reports `0n`. Generated once and pinned; nothing derives it at runtime.
 */
export const RECIPIENT_ACCOUNT = {
  privateKey: "APrivateKey1zkpHj8RPJD1wJR818BSyLPa5f5fR4uxYgW2jas7atx83HG8",
  viewKey: "AViewKey1pkn1tUEsorWKPtj5pMHhN9U65ERwhW4AuNKDpnzWPQU7",
  address: "aleo1l2x2kxsv3qt4m0364ezpx50y0t47f7pdme0jt0y9m4dxzeck8yxqqgac0y",
} as const;

/**
 * Recipient for the pre-scenario probes that spend genesis funds directly. Kept
 * apart from RECIPIENT_ACCOUNT so the scenario can assert the recipient's
 * balance equals exactly what the scenario sent.
 */
export const PROBE_ADDRESS = "aleo1nfhry9rq4tjgp75e0kt9dm6ttxejxrndqtrd598575cmexp8q58qzpucsx";

/**
 * Bounds on the fee a devnode charges `transfer_public` when built by
 * `buildDevnodeExecutionTransaction`. The exact amount depends on which
 * `ConsensusVersion` the wasm resolves for the devnode's block height and on the
 * cost table that version carries, so it moves with any `@provablehq/sdk` bump —
 * the window spans both the oldest table (`execution_cost_v1`, no ARC-0005
 * discount) and a modern discounted one.
 */
export const DEVNODE_TRANSFER_PUBLIC_FEE_RANGE = { min: 1_000, max: 100_000 };

/** Amount the scenario transfers, in microcredits. */
export const TRANSFER_AMOUNT_MICROCREDITS = 1_000_000;

/**
 * What the scenario funds its sender with before the tracked transfer, in
 * microcredits. Must clear TRANSFER_AMOUNT_MICROCREDITS plus whatever the
 * devnode charges as a fee, so it carries the same headroom as
 * DEVNODE_TRANSFER_PUBLIC_FEE_RANGE.max.
 */
export const FUNDING_AMOUNT_MICROCREDITS =
  TRANSFER_AMOUNT_MICROCREDITS + DEVNODE_TRANSFER_PUBLIC_FEE_RANGE.max * 2;

export type GeneratedAleoAccount = { privateKey: string; viewKey: string; address: string };

/**
 * A fresh keypair unknown to the chain. Scenarios that need both an OUT and an
 * IN side use this instead of the pinned GENESIS_ACCOUNT/RECIPIENT_ACCOUNT, so
 * the sender itself has to be funded first and its balance is exact rather
 * than inherited from unrelated prior runs.
 */
export async function generateAleoAccount(): Promise<GeneratedAleoAccount> {
  const wasm = await loadAleoWasm();
  const privateKey = new wasm.PrivateKey();
  return {
    privateKey: privateKey.to_string(),
    viewKey: privateKey.to_view_key().to_string(),
    address: privateKey.to_address().to_string(),
  };
}

/** Base fee coin-aleo bills for `transfer_public`, in microcredits. */
export const TRANSFER_PUBLIC_BASE_FEE = 34060;

export const ALEO = getCryptoCurrencyById("aleo_testnet");

/**
 * Production values from libs/ledger-live-common/src/families/aleo/config.ts,
 * with two deliberate deviations:
 *  - isFeeSponsored: false, because sponsorship needs a Ledger service that does
 *    not exist locally. With false the fee is signed by the signer and the
 *    fee_public path enters the test's scope;
 *  - useEncryptedProve: false, which routes broadcast at /prove/{net}/prove and
 *    drops /prove/pubkey and /prove/prove/encrypted from scope. The encrypted
 *    path would mean opening a crypto_box sealed box in TypeScript.
 */
export function buildAleoCoinConfig(): AleoCoinConfig {
  return {
    status: { type: "active" },
    networkType: ALEO_NETWORK_TYPE,
    apiUrls: {
      node: ALEO_FAKE_NODE,
      sdk: ALEO_LOCAL_SDK,
    },
    feeByTransactionType: {
      [TRANSACTION_TYPE.TRANSFER_PUBLIC]: TRANSFER_PUBLIC_BASE_FEE,
      [TRANSACTION_TYPE.TRANSFER_PRIVATE]: 2308,
      [TRANSACTION_TYPE.CONVERT_PUBLIC_TO_PRIVATE]: 17972,
      [TRANSACTION_TYPE.CONVERT_PRIVATE_TO_PUBLIC]: 18494,
      [TRANSACTION_TYPE.TRANSFER_TOKEN_PUBLIC]: 34060,
      [TRANSACTION_TYPE.TRANSFER_TOKEN_PRIVATE]: 2308,
      [TRANSACTION_TYPE.CONVERT_TOKEN_PRIVATE_TO_PUBLIC]: 18494,
      [TRANSACTION_TYPE.CONVERT_TOKEN_PUBLIC_TO_PRIVATE]: 17972,
    },
    feeSafetyMultiplier: 1,
    isFeeSponsored: false,
    enableTokens: false,
    useEncryptedProve: false,
    recordPickingStrategy: "auto",
  };
}

/**
 * The view key MUST go into the account id as customData: extractViewKey reads
 * it back through decodeAccountId, and both performPublicSync and
 * buildSyncObservables call it unconditionally, behind an invariant.
 */
export function makeAleoAccount(address: string, viewKey: string): AleoAccount {
  const derivationMode = "";
  const id = encodeAccountId({
    type: "js",
    version: "2",
    currencyId: ALEO.id,
    xpubOrAddress: address,
    derivationMode,
    customData: viewKey,
  });
  const index = 0;
  const freshAddressPath = runDerivationScheme(
    getDerivationScheme({ derivationMode, currency: ALEO }),
    ALEO,
    { account: index, node: 0, address: 0 },
  );

  return {
    type: "Account",
    id,
    xpub: address,
    subAccounts: [],
    seedIdentifier: address,
    used: true,
    swapHistory: [],
    derivationMode,
    currency: ALEO,
    index,
    nfts: [],
    freshAddress: address,
    freshAddressPath,
    creationDate: new Date(),
    lastSyncDate: new Date(0),
    blockHeight: 0,
    balance: new BigNumber(0),
    spendableBalance: new BigNumber(0),
    operationsCount: 0,
    operations: [],
    pendingOperations: [],
    balanceHistoryCache: {
      HOUR: { latestDate: null, balances: [] },
      DAY: { latestDate: null, balances: [] },
      WEEK: { latestDate: null, balances: [] },
    },
  };
}
