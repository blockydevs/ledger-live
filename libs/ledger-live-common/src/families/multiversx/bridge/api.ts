import type { AssetInfo } from "@ledgerhq/coin-module-framework/api/types";
import { getCryptoAssetsStore } from "@ledgerhq/ledger-wallet-framework/cryptoAssetsStore";
import type {
  BridgeApi,
  FamilyAccountShape,
  OptimisticOperationDescriptor,
} from "@ledgerhq/ledger-wallet-framework/api/types";
import type { MultiversXCoinConfig } from "@ledgerhq/coin-multiversx/config";
import { createNetworkApi } from "@ledgerhq/coin-multiversx/network/api";
import { buildContext } from "../../../bridge/generic-coin-framework/api/context";
import { CHAIN_ID } from "@ledgerhq/coin-multiversx/constants";
import { MULTIVERSX_CURRENCY_ID } from "../constants";
import { extractTokenId } from "@ledgerhq/coin-multiversx/logic";
import type { Account, Operation } from "@ledgerhq/types-live";
import { isMultiversXOperationExtra } from "../types";
import type { MultiversXDeviceSignOptions } from "../signer";
import type { CryptoCurrency } from "@domain/entity-currency-crypto";
import type { TokenCurrency } from "@domain/entity-currency-token";

export async function getTokenFromAsset(
  currency: CryptoCurrency,
  asset: AssetInfo,
): Promise<TokenCurrency | undefined> {
  const result =
    "assetReference" in asset &&
    typeof asset.assetReference === "string" &&
    "assetOwner" in asset &&
    typeof asset.assetOwner === "string"
      ? await getCryptoAssetsStore().findTokenByAddressInCurrency(
          asset.assetOwner,
          currency.id,
          asset.assetReference,
        )
      : undefined;
  return result;
}

export function getAssetFromToken(token: TokenCurrency): AssetInfo | undefined {
  if (!token.tokenIdentifier) return undefined;
  return {
    type: token.tokenType,
    assetReference: token.tokenIdentifier,
    assetOwner: token.contractAddress,
  };
}

/**
 * The coin module branches on MultiversX's own mode names in `craftTransaction`, `estimateFees` and
 * `validateIntent`. The apps write those names, since the legacy bridge (the rollback path) reads only
 * them; the generic names are accepted too, for when the apps move to them with the legacy removal.
 */
export function computeIntentType(transaction: Record<string, unknown>): string {
  const mode = transaction.mode;

  switch (mode) {
    case "send":
    case undefined:
      return "send";
    case "delegate":
    case "withdraw":
      return mode;
    case "undelegate":
    case "unDelegate":
      return "unDelegate";
    case "claimReward":
    case "claimRewards":
      return "claimRewards";
    case "compoundReward":
    case "reDelegateRewards":
      return "reDelegateRewards";
    default:
      throw new Error(`Unsupported MultiversX transaction mode: ${String(mode)}`);
  }
}

/**
 * Pending-row types matching what MultiversX's synced history produces. The apps still write
 * MultiversX's own mode names (the legacy bridge, the rollback path, reads only those), which the
 * generic mapping does not know and would file as `OUT`. Its `compoundReward` → `REWARD` also
 * differs from the history's `DELEGATE` for a re-delegation of rewards.
 */
const OPTIMISTIC_OPERATION_TYPES: Record<string, OptimisticOperationDescriptor["type"]> = {
  unDelegate: "UNDELEGATE",
  claimRewards: "REWARD",
  reDelegateRewards: "DELEGATE",
  compoundReward: "DELEGATE",
};

export function describeOptimisticOperation(
  mode: string,
): OptimisticOperationDescriptor | undefined {
  const type = OPTIMISTIC_OPERATION_TYPES[mode];
  return type ? { type } : undefined;
}

/**
 * app-multiversx names an ESDT on screen only once it has received the token's CAL-signed metadata;
 * `families/multiversx/signer.ts` sends it before signing.
 */
export function getDeviceSignOptions(
  transaction: Record<string, unknown>,
  account: Account,
): MultiversXDeviceSignOptions | undefined {
  const { subAccountId } = transaction;
  const token =
    typeof subAccountId === "string"
      ? account.subAccounts?.find(sub => sub.id === subAccountId)?.token
      : undefined;
  if (!token) return undefined;
  return {
    esdt: {
      ticker: token.ticker,
      identifier: extractTokenId(token.id),
      decimals: token.units[0].magnitude,
      chainId: CHAIN_ID,
      ledgerSignature: token.ledgerSignature,
    },
  };
}

/**
 * Attaches `multiversxResources` to the account shape: the staking section reads `delegations` (each
 * with its own unbonding entries and timers) and the guarded-account warning reads `isGuarded`.
 */
export async function buildAccountShape(address: string): Promise<FamilyAccountShape> {
  const config = await buildContext<MultiversXCoinConfig>(MULTIVERSX_CURRENCY_ID).config();
  const api = createNetworkApi(config.apiEndpoint, config.delegationApiEndpoint);
  const [{ nonce, isGuarded }, delegations] = await Promise.all([
    api.getAccountDetails(address),
    api.getAccountDelegations(address),
  ]);
  return { multiversxResources: { nonce, delegations, isGuarded } };
}

/**
 * Moves the called smart contract from the operation extra to `Operation.contract`, where the
 * legacy bridge puts it and the staking operation details look up the validator.
 */
export function adaptOperations(_address: string, operations: Operation[]): Operation[] {
  return operations.map(operation => {
    if (!isMultiversXOperationExtra(operation.extra) || !operation.extra.contract) return operation;
    const { contract, ...extra } = operation.extra;
    return { ...operation, contract, extra };
  });
}

export default function multiversxBridge(currency: CryptoCurrency): BridgeApi {
  return {
    getTokenFromAsset: (asset: AssetInfo) => getTokenFromAsset(currency, asset),
    getAssetFromToken,
    computeIntentType: (transaction: Record<string, unknown>) => computeIntentType(transaction),
    buildAccountShape,
    describeOptimisticOperation,
    getDeviceSignOptions,
    adaptOperations,
    stakingSupported: true,
  };
}
