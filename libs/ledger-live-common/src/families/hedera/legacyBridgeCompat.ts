import type { AssetInfo } from "@ledgerhq/coin-module-framework/api/types";
import type { HederaCoinConfig } from "@ledgerhq/coin-hedera/config";
import { HEDERA_TRANSACTION_MODES } from "@ledgerhq/coin-hedera/constants";
import { getTokenFromAsset } from "@ledgerhq/coin-hedera/logic/getTokenFromAsset";
import { createBridges } from "@ledgerhq/coin-hedera/bridge/index";
import { defer, from, map, switchMap } from "rxjs";
import type {
  HederaAccount,
  HederaSigner,
  StakeWithNodeDetails,
  Transaction as LegacyTransaction,
  TransactionStatus,
} from "@ledgerhq/coin-hedera/types";
import { updateTransaction as mergeTransaction } from "@ledgerhq/ledger-wallet-framework/bridge/jsHelpers";
import type { SignerContext } from "@ledgerhq/ledger-wallet-framework/signer";
import type {
  Account,
  AccountBridge,
  CurrencyBridge,
  ScanAccountEvent,
} from "@ledgerhq/types-live";
import { assignFromAccountRaw, assignToAccountRaw } from "./serialization";
import type { Transaction } from "./types";

function toStakingNodeId(valId: string | undefined): number | null {
  if (!valId) return null;
  const stakingNodeId = Number(valId);
  return Number.isNaN(stakingNodeId) ? null : stakingNodeId;
}

function toValId(stakingNodeId: number | null | undefined): string | undefined {
  return stakingNodeId == null ? undefined : String(stakingNodeId);
}

/**
 * Maps the generic coin-framework transaction shape to the legacy `coin-hedera/src/bridge`
 * discriminated union, so a caller can run either bridge against the same input.
 */
export function toLegacyTx(tx: Transaction): LegacyTransaction {
  const mode = tx.mode ?? HEDERA_TRANSACTION_MODES.Send;
  const common = {
    amount: tx.amount,
    recipient: tx.recipient,
    recipientDomain: tx.recipientDomain,
    useAllAmount: tx.useAllAmount,
    subAccountId: tx.subAccountId,
    feesStrategy: tx.feesStrategy,
    family: "hedera" as const,
    memo: tx.memoValue ?? undefined,
    maxFee: tx.fees ?? undefined,
  };

  switch (mode) {
    case HEDERA_TRANSACTION_MODES.Send:
      return {
        ...common,
        mode: HEDERA_TRANSACTION_MODES.Send,
        gasLimit: tx.gasLimit ?? undefined,
      };
    case HEDERA_TRANSACTION_MODES.TokenAssociate: {
      if (!tx.assetReference || !tx.assetOwner) {
        throw new Error(
          "hedera: token-associate transaction is missing assetReference/assetOwner",
        );
      }
      return {
        ...common,
        mode: HEDERA_TRANSACTION_MODES.TokenAssociate,
        assetReference: tx.assetReference,
        assetOwner: tx.assetOwner,
      } as LegacyTransaction; // properties.token is resolved later by withToken
    }
    case HEDERA_TRANSACTION_MODES.Delegate:
      return {
        ...common,
        mode: HEDERA_TRANSACTION_MODES.Delegate,
        properties: { stakingNodeId: toStakingNodeId(tx.valId) },
      };
    case HEDERA_TRANSACTION_MODES.Undelegate:
      return {
        ...common,
        mode: HEDERA_TRANSACTION_MODES.Undelegate,
        properties: { stakingNodeId: toStakingNodeId(tx.valId) },
      };
    case HEDERA_TRANSACTION_MODES.Redelegate:
      return {
        ...common,
        mode: HEDERA_TRANSACTION_MODES.Redelegate,
        properties: { stakingNodeId: toStakingNodeId(tx.valId) },
      };
    case HEDERA_TRANSACTION_MODES.ClaimRewards:
      return {
        ...common,
        mode: HEDERA_TRANSACTION_MODES.ClaimRewards,
      };
    default:
      throw new Error(`hedera: unsupported transaction mode: ${mode}`);
  }
}

/**
 * Maps the legacy `coin-hedera/src/bridge` transaction shape to the generic coin-framework one.
 * Inverse of `toLegacyTx`, minus the token resolution `withToken` performs on the way back in.
 */
export function toGenericTx(tx: LegacyTransaction): Transaction {
  const mode = tx.mode;
  const common = {
    amount: tx.amount,
    recipient: tx.recipient,
    recipientDomain: tx.recipientDomain,
    useAllAmount: tx.useAllAmount,
    subAccountId: tx.subAccountId,
    feesStrategy: tx.feesStrategy,
    family: "hedera" as const,
    memoValue: tx.memo,
    memoType: tx.memo ? ("text" as const) : undefined,
    fees: tx.maxFee ?? null,
  };

  switch (tx.mode) {
    case HEDERA_TRANSACTION_MODES.Send:
      return {
        ...common,
        mode: HEDERA_TRANSACTION_MODES.Send,
        gasLimit: tx.gasLimit ?? null,
      };
    case HEDERA_TRANSACTION_MODES.TokenAssociate:
      return {
        ...common,
        mode: HEDERA_TRANSACTION_MODES.TokenAssociate,
        assetReference: tx.assetReference,
        assetOwner: tx.assetOwner,
      };
    case HEDERA_TRANSACTION_MODES.Delegate:
    case HEDERA_TRANSACTION_MODES.Undelegate:
    case HEDERA_TRANSACTION_MODES.Redelegate:
    case HEDERA_TRANSACTION_MODES.ClaimRewards:
      return {
        ...common,
        mode: tx.mode,
        valId: toValId(tx.properties?.stakingNodeId),
      };
    default:
      throw new Error(`hedera: unsupported transaction mode: ${mode}`);
  }
}

/**
 * Resolves and fills in `properties.token` for a token-associate transaction. Every other mode
 * is returned unchanged: token resolution needs the crypto assets store (via `account`), which
 * the pure `toLegacyTx`/`toGenericTx` mappers above deliberately don't touch.
 */
export async function withToken(
  legacyTx: LegacyTransaction,
  account: Account,
): Promise<LegacyTransaction> {
  if (legacyTx.mode !== HEDERA_TRANSACTION_MODES.TokenAssociate) {
    return legacyTx;
  }

  const asset: AssetInfo = {
    type: "hts",
    assetReference: legacyTx.assetReference,
    assetOwner: legacyTx.assetOwner,
  };
  const token = await getTokenFromAsset(account.currency, asset);
  if (!token) {
    throw new Error(
      `hedera: could not resolve token for asset reference ${legacyTx.assetReference}`,
    );
  }

  return { ...legacyTx, properties: { token } };
}

/**
 * Inverse of `getHederaDelegation` (`families/hedera/delegation.ts`): rebuilds the single
 * `stakingPositions` entry the UI reads from the `hederaResources.delegation` the legacy
 * `getAccountShape` actually populates. Always recomputed from the current account rather than
 * merged with any previous value, so a `null` delegation clears a stale position instead of
 * leaving it in place.
 */
function toStakingPositions(account: HederaAccount): StakeWithNodeDetails[] {
  const delegation = account.hederaResources?.delegation;
  if (!delegation) return [];

  const amountDeposited = BigInt(delegation.delegated.toFixed(0));
  const amountRewarded = BigInt(delegation.pendingReward.toFixed(0));

  return [
    {
      uid: account.freshAddress,
      address: account.freshAddress,
      asset: { type: "native" },
      state: "active",
      actions: [],
      amount: amountDeposited + amountRewarded,
      amountDeposited,
      amountRewarded,
      details: { stakedNodeId: delegation.nodeId, overstaked: null },
    },
  ];
}

/**
 * Shared by `sync` and `scanAccounts` so a freshly discovered account carries the same
 * `stakingPositions` a synced one does, instead of only gaining it on the first background sync.
 */
function withStakingPositions(account: HederaAccount): HederaAccount {
  return { ...account, stakingPositions: toStakingPositions(account) };
}

/**
 * Wraps the legacy `coin-hedera/src/bridge` bridges so they accept and return the generic
 * coin-framework transaction shape the UI now builds. Lets `bridge/impl.ts` fall back to the
 * legacy bridge when `genericCoinFrameworkFamilies.json` disables the generic one for hedera,
 * without the UI having to know which bridge is live.
 */
export function createLegacyCompatBridges(
  signerContext: SignerContext<HederaSigner>,
  getCurrencyConfig: (currencyId?: string) => HederaCoinConfig,
): {
  currencyBridge: CurrencyBridge;
  accountBridge: AccountBridge<Transaction, HederaAccount, TransactionStatus>;
} {
  const legacy = createBridges(signerContext, getCurrencyConfig);
  const legacyAccountBridge = legacy.accountBridge;
  // Omitted, not set to `undefined`: `bridge/impl.ts` merges
  // `{ ...defaultBridgeExtensions, ...bridge, ...extensions }`, so an own property here — even
  // `undefined` — would shadow `defaultBridgeExtensions`'s real fallback for that key. The legacy
  // bridge never implements these, and they're typed on the legacy `Transaction`, so they're
  // dropped from the spread rather than translated.
  const {
    getEditTransactionPatch: _getEditTransactionPatch,
    getEditTransactionStatus: _getEditTransactionStatus,
    getFormattedFeeFields: _getFormattedFeeFields,
    hasMinimumFundsToCancel: _hasMinimumFundsToCancel,
    hasMinimumFundsToSpeedUp: _hasMinimumFundsToSpeedUp,
    isStrategyDisabled: _isStrategyDisabled,
    ...legacyAccountBridgeRest
  } = legacyAccountBridge;

  const accountBridge: AccountBridge<Transaction, HederaAccount, TransactionStatus> = {
    ...legacyAccountBridgeRest,
    createTransaction: account => toGenericTx(legacyAccountBridge.createTransaction(account)),
    // The patch is generic-shaped and can carry fields (e.g. `valId`) `toLegacyTx` cannot map
    // back from a partial input, so the merge runs on the generic shape directly instead of
    // round-tripping through the legacy one.
    updateTransaction: mergeTransaction,
    prepareTransaction: async (account, transaction) => {
      const legacyTx = await withToken(toLegacyTx(transaction), account);
      const prepared = await legacyAccountBridge.prepareTransaction(account, legacyTx);
      return toGenericTx(prepared);
    },
    getTransactionStatus: async (account, transaction) =>
      legacyAccountBridge.getTransactionStatus(
        account,
        await withToken(toLegacyTx(transaction), account),
      ),
    // Legacy `estimateMaxSpendable` only reads `account`/`parentAccount` and never looks at
    // `transaction`, so it is passed through unmapped rather than risking `toLegacyTx`'s throw
    // paths (an incomplete token-associate, an unknown mode) on a call that never inspects them.
    estimateMaxSpendable: arg0 =>
      legacyAccountBridge.estimateMaxSpendable(
        arg0 as Parameters<typeof legacyAccountBridge.estimateMaxSpendable>[0],
      ),
    signOperation: arg0 =>
      defer(() => from(withToken(toLegacyTx(arg0.transaction), arg0.account))).pipe(
        switchMap(transaction => legacyAccountBridge.signOperation({ ...arg0, transaction })),
      ),
    assignToAccountRaw,
    assignFromAccountRaw,
    sync: (initialAccount, syncConfig) =>
      legacyAccountBridge.sync(initialAccount, syncConfig).pipe(
        map(updater => (account: HederaAccount) => withStakingPositions(updater(account))),
      ),
  };

  const currencyBridge: CurrencyBridge = {
    ...legacy.currencyBridge,
    scanAccounts: scanInfo =>
      legacy.currencyBridge.scanAccounts(scanInfo).pipe(
        map((event: ScanAccountEvent): ScanAccountEvent =>
          event.type === "discovered"
            ? { ...event, account: withStakingPositions(event.account as HederaAccount) }
            : event,
        ),
      ),
  };

  return { currencyBridge, accountBridge };
}
