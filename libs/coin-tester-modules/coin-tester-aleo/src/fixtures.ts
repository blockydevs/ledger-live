import BigNumber from "bignumber.js";
import { encodeAccountId } from "@ledgerhq/ledger-wallet-framework/account";
import { getCryptoCurrencyById } from "@ledgerhq/ledger-wallet-framework/currencies";
import {
  getDerivationScheme,
  runDerivationScheme,
} from "@ledgerhq/ledger-wallet-framework/derivation";
import { TRANSACTION_TYPE } from "@ledgerhq/coin-aleo/constants";
import type { AleoAccount, AleoCoinConfig, AleoResources } from "@ledgerhq/coin-aleo/types";
import { loadAleoWasm } from "./wasm";

/** REST endpoint the devnode serves. */
export const ALEO_LOCAL_NODE = "http://127.0.0.1:3030";

/** The network devnode runs; also the path segment in every REST route. */
export const ALEO_NETWORK_TYPE = "testnet";

/** SDK backend base; same network segment the devnode uses. */
export const ALEO_LOCAL_SDK = `http://127.0.0.1:3031/network/${ALEO_NETWORK_TYPE}`;

/**
 * Origin the tester points `apiUrls.node` at. Not localhost: MSW's
 * `onUnhandledRequest` lets 127.0.0.1 through, so an unhandled node route
 * there would silently hit the devnode instead of failing.
 */
export const ALEO_FAKE_NODE = "http://aleo-node.test";

/**
 * The devnode's genesis account — the only prefunded one, and the account
 * scenarios fund from. `leo devnode start` builds genesis around a single
 * `--private-key`, so unlike `leo devnet` there is exactly one spendable
 * balance; this is the key leo recommends for local use, and the Dockerfile
 * passes the same one. `assertGenesisAccountIsFunded` re-reads its balance
 * from the running node so a change to how devnode seeds genesis fails loudly.
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
 * Bounds on the fee a devnode charges `fee_public` (`transfer_public` and the
 * `transfer_public_to_private` conversions). The exact amount depends on the
 * `ConsensusVersion`'s cost table, so this window spans both the oldest table
 * (`execution_cost_v1`, no ARC-0005 discount) and a modern discounted one.
 */
export const PUBLIC_DEVNODE_FEE_RANGE = { min: 1_000, max: 100_000 };

/**
 * Bounds on the fee a devnode charges `fee_private`. Priced well below
 * PUBLIC_DEVNODE_FEE_RANGE since a private transition skips the public
 * finalize cost, so it needs its own floor.
 */
export const PRIVATE_DEVNODE_FEE_RANGE = { min: 500, max: 100_000 };

/** Amount the scenario transfers, in microcredits. */
export const TRANSFER_AMOUNT_MICROCREDITS = 1_000_000;

/**
 * What the scenario funds its sender with before the tracked transfer, in
 * microcredits. Must clear TRANSFER_AMOUNT_MICROCREDITS plus whatever the
 * devnode charges as a `fee_public`, so it carries the same headroom as
 * PUBLIC_DEVNODE_FEE_RANGE.max.
 */
export const FUNDING_AMOUNT_MICROCREDITS =
  TRANSFER_AMOUNT_MICROCREDITS + PUBLIC_DEVNODE_FEE_RANGE.max * 2;

/**
 * Record big enough to cover TRANSFER_AMOUNT_MICROCREDITS plus a `fee_private`
 * paid from the change: the private-transfer scenario spends this one as the
 * amount record.
 */
export const RECORD_A_MICROCREDITS = TRANSFER_AMOUNT_MICROCREDITS + PRIVATE_DEVNODE_FEE_RANGE.max;

/**
 * Record reserved for `fee_private`. Sized as headroom against underflow in
 * `fee_private`'s `sub`, not as a fee measurement — `validatePrivateFeeRecord`
 * only checks against the billed 2308, so a tighter record would still fail
 * on-chain despite passing validation.
 */
export const RECORD_B_MICROCREDITS = PRIVATE_DEVNODE_FEE_RANGE.max * 2;

export type GeneratedAleoAccount = { privateKey: string; viewKey: string; address: string };

/**
 * A fresh keypair unknown to the chain, used instead of the pinned
 * GENESIS_ACCOUNT/RECIPIENT_ACCOUNT when a scenario needs an exact balance
 * rather than one inherited from prior runs.
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

/** Base fee coin-aleo bills for `transfer_private`, in microcredits. */
export const TRANSFER_PRIVATE_BASE_FEE = 2308;

/** Base fee coin-aleo bills for `transfer_public_to_private`, in microcredits. */
export const CONVERT_PUBLIC_TO_PRIVATE_BASE_FEE = 17972;

export const ALEO = getCryptoCurrencyById("aleo_testnet");

/**
 * Production values from libs/ledger-live-common/src/families/aleo/config.ts,
 * with two deviations: isFeeSponsored: false, since sponsorship needs a
 * Ledger service unavailable locally; useEncryptedProve: false, to avoid
 * opening a crypto_box sealed box in TypeScript.
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
      [TRANSACTION_TYPE.TRANSFER_PRIVATE]: TRANSFER_PRIVATE_BASE_FEE,
      [TRANSACTION_TYPE.CONVERT_PUBLIC_TO_PRIVATE]: CONVERT_PUBLIC_TO_PRIVATE_BASE_FEE,
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

/**
 * makeAleoAccount plus aleoResources seeded as already privately synced.
 *
 * lastPrivateSyncDate must be non-null from the start: buildSyncObservables
 * only runs the private sync step when the account has synced privately
 * before, and left null every cycle would keep skipping it. The epoch value
 * works because production gates only on truthiness, and stays comparable so
 * a test can assert the sync moved it forward.
 */
export function makePrivateAleoAccount(address: string, viewKey: string): AleoAccount {
  const aleoResources: AleoResources = {
    transparentBalance: new BigNumber(0),
    provableApi: null,
    privateBalance: null,
    unspentPrivateRecords: null,
    lastPrivateSyncDate: new Date(0),
  };

  return { ...makeAleoAccount(address, viewKey), aleoResources };
}
