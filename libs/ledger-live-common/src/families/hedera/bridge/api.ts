import BigNumber from "bignumber.js";
import type { AssetInfo, Balance } from "@ledgerhq/coin-module-framework/api/types";
import type { CryptoCurrency, TokenCurrency } from "@ledgerhq/types-cryptoassets";
import type { Account, Operation as LiveOperation } from "@ledgerhq/types-live";
import type { BridgeApi } from "@ledgerhq/ledger-wallet-framework/api/types";
import type { GetAddressResult } from "@ledgerhq/ledger-wallet-framework/derivation";
import { getEnv } from "@ledgerhq/live-env";
import { getAssetFromToken } from "@ledgerhq/coin-hedera/logic/getAssetFromToken";
import { getTokenFromAsset } from "@ledgerhq/coin-hedera/logic/getTokenFromAsset";
import { HEDERA_TRANSACTION_MODES } from "@ledgerhq/coin-hedera/constants";
import type {
  HederaAccount,
  HederaOperationExtra,
  HederaResources,
} from "@ledgerhq/coin-hedera/types";
import { hederaBuildIterateResult } from "../buildIterateResult";

const HEDERA_STAKING_MODES = new Set<string>([
  HEDERA_TRANSACTION_MODES.Delegate,
  HEDERA_TRANSACTION_MODES.Undelegate,
  HEDERA_TRANSACTION_MODES.Redelegate,
]);

export function computeIntentType(transaction: Record<string, unknown>): string {
  const { mode } = transaction;
  if (mode == null) return HEDERA_TRANSACTION_MODES.Send;
  if (typeof mode !== "string") throw new Error(`Unsupported transaction mode: ${String(mode)}`);

  switch (mode) {
    case HEDERA_TRANSACTION_MODES.Send:
    case HEDERA_TRANSACTION_MODES.TokenAssociate:
    case HEDERA_TRANSACTION_MODES.Delegate:
    case HEDERA_TRANSACTION_MODES.Undelegate:
    case HEDERA_TRANSACTION_MODES.Redelegate:
    case HEDERA_TRANSACTION_MODES.ClaimRewards:
      return mode;
    default:
      throw new Error(`Unsupported transaction mode: ${mode}`);
  }
}

// ERC20 recipients are raw EVM hex addresses (ADR 0002) and carry no Hedera checksum to strip.
function isErc20Transaction(transaction: Record<string, unknown>): boolean {
  return (
    typeof transaction.assetReference === "string" && transaction.assetReference.startsWith("0x")
  );
}

function stripHederaChecksum(address: string): string {
  return address.split("-")[0];
}

function getPreviousStakingNodeId(account: HederaAccount): number | null {
  const details = account.stakingPositions?.[0]?.details as { stakedNodeId?: number } | undefined;
  return typeof details?.stakedNodeId === "number" ? details.stakedNodeId : null;
}

function enrichOptimisticOperation(
  account: Account,
  transaction: Record<string, unknown>,
  operation: LiveOperation,
): LiveOperation {
  const stripChecksum = !isErc20Transaction(transaction);
  const senders = stripChecksum ? operation.senders.map(stripHederaChecksum) : operation.senders;
  let recipients = stripChecksum
    ? operation.recipients.map(stripHederaChecksum)
    : operation.recipients;
  let value = operation.value;

  const extra: Partial<HederaOperationExtra> = {
    ...(operation.extra as Partial<HederaOperationExtra>),
  };

  // OperationDetails reads extra.memo. The synced operation gets it from the mirror node, so
  // without it here the memo row disappears between broadcast and the next sync.
  const memo = typeof transaction.memoValue === "string" ? transaction.memoValue : undefined;

  if (transaction.mode === HEDERA_TRANSACTION_MODES.TokenAssociate) {
    if (typeof transaction.assetReference === "string") {
      extra.associatedTokenId = transaction.assetReference;
    }
  } else if (transaction.mode === HEDERA_TRANSACTION_MODES.ClaimRewards) {
    // The UI transaction for this mode carries only `mode`; the actual transfer amount and
    // recipient are hardcoded in craftTransaction.ts, so the optimistic operation must read
    // them from the same source to show the right value before the next sync.
    value = new BigNumber(1);
    const recipient = getEnv("HEDERA_CLAIM_REWARDS_RECIPIENT_ACCOUNT_ID");
    recipients = [stripChecksum ? stripHederaChecksum(recipient) : recipient];
  } else if (HEDERA_STAKING_MODES.has(transaction.mode as string)) {
    extra.memo = memo ?? null;
    extra.targetStakingNodeId =
      typeof transaction.valId === "string" ? Number(transaction.valId) : null;
    extra.previousStakingNodeId = getPreviousStakingNodeId(account as HederaAccount);
  } else if (memo) {
    extra.memo = memo;
  }

  return { ...operation, senders, recipients, value, extra };
}

const OPERATION_DETAILS_TO_EXTRA_KEYS: (keyof HederaOperationExtra)[] = [
  "consensusTimestamp",
  // getTransactionExplorer builds the HashScan link from this one.
  "transactionId",
  "associatedTokenId",
  "targetStakingNodeId",
  "previousStakingNodeId",
  "gasConsumed",
  "gasUsed",
  "gasLimit",
];

function mapOperationDetailsToExtra(details: Record<string, unknown>): Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  for (const key of OPERATION_DETAILS_TO_EXTRA_KEYS) {
    if (details[key] !== undefined) {
      extra[key] = details[key];
    }
  }
  return extra;
}

// Hgraph's `erc_token_account` relation carries a row for any ERC20 the account ever interacted
// with, including one now sitting at a zero balance (fully sent away, or received then burned).
// `operations` here is this sync run's operations for the token, not the account's full history,
// so this predicate only catches the case where that history is also absent from the run: a token
// associated but never moved. Mirrors the legacy bridge's identical filter, written against the
// same relation (coin-hedera/src/bridge/utils.ts:254: `isERC20 && operations.length === 0 &&
// balance.isZero()`).
function shouldBuildTokenAccount(
  balance: Balance,
  token: TokenCurrency,
  operations: LiveOperation[],
): boolean {
  return !(token.tokenType === "erc20" && balance.value === 0n && operations.length === 0);
}

// The mirror node account payload carries `max_automatic_token_associations`, which the
// generic `Balance`/`Stake` shapes have no field for.
async function fetchAccountResources(
  currencyId: string,
  address: string,
): Promise<{ hederaResources: HederaResources } | undefined> {
  const { apiClient } = await import("@ledgerhq/coin-hedera/network/api");
  try {
    const mirrorAccount = await apiClient.getAccount({ configOrCurrencyId: currencyId, address });
    return {
      hederaResources: {
        maxAutomaticTokenAssociations: mirrorAccount.max_automatic_token_associations,
        isAutoTokenAssociationEnabled: mirrorAccount.max_automatic_token_associations === -1,
        delegation: null,
      },
    };
  } catch (e) {
    const errNamed = e as { name?: string; status?: number } | null | undefined;
    const isNonExistentAccount =
      errNamed?.name === "HederaAddAccountError" ||
      (errNamed?.name === "LedgerAPI4xx" && errNamed?.status === 404);
    if (isNonExistentAccount) return undefined;
    throw e;
  }
}

// The device returns its public key as `address` and never computes an account address
// (coin-hedera/src/signer/getAddress.ts), so identity is confirmed against `seedIdentifier`
// instead, matching coin-hedera/src/bridge/receive.ts:28.
function receiveAddressMatcher(
  result: GetAddressResult,
  account: Account,
): { matches: boolean; address: string } {
  return {
    matches: result.publicKey === account.seedIdentifier,
    address: account.freshAddress,
  };
}

export default function hederaBridge(currency: CryptoCurrency): BridgeApi {
  return {
    fetchAccountResources,
    receiveAddressMatcher,
    getTokenFromAsset: (asset: AssetInfo) => getTokenFromAsset(currency, asset),
    getAssetFromToken: (token: TokenCurrency, owner: string) => getAssetFromToken(token, owner),
    computeIntentType,
    usesStakingPositions: true,
    enrichOptimisticOperation,
    mapOperationDetailsToExtra,
    // Hedera already tags a true fee-only operation as `FEES` at the coin module's own logic
    // layer (see `processERC20Transfers`/`processHTSTokenTransfers`), so the generic collapse
    // only ever fires here on a genuine standalone `OUT` with no net transfer — e.g. the
    // account-auto-creation sub-transaction billed alongside a `CRYPTOTRANSFER` to a fresh
    // alias — which must stay `OUT` to match the legacy bridge.
    keepFeesOnlyNativeOpType: true,
    shouldBuildTokenAccount,
    buildIterateResult: hederaBuildIterateResult,
  };
}
