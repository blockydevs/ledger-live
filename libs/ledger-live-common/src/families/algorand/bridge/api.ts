import { addPrefixToken, extractTokenId } from "@ledgerhq/coin-algorand/tokens";
import type { AssetInfo } from "@ledgerhq/coin-module-framework/api/types";
import type {
  BridgeApi,
  OptimisticOperationDescriptor,
} from "@ledgerhq/ledger-wallet-framework/api/types";
import { getCryptoAssetsStore } from "@ledgerhq/ledger-wallet-framework/cryptoAssetsStore";
import type { TokenCurrency } from "@domain/entity-currency-token";

// The ASA id is the suffix of the token id: an ASA's `contractAddress` is its creator's address.
export async function getTokenFromAsset(asset: AssetInfo): Promise<TokenCurrency | undefined> {
  const assetReference = "assetReference" in asset ? asset.assetReference : undefined;
  if (asset.type === "native" || !assetReference) return undefined;

  return getCryptoAssetsStore().findTokenById(addPrefixToken(assetReference));
}

export function getAssetFromToken(token: TokenCurrency, owner: string): AssetInfo {
  return {
    type: "asa",
    assetOwner: owner,
    assetReference: extractTokenId(token.id),
  };
}

export function computeIntentType(transaction: Record<string, unknown>): string {
  const { mode } = transaction;

  switch (mode) {
    case "send":
    case undefined:
      return "send";
    case "optIn":
      return "optIn";
    default:
      throw new Error(`Unsupported Algorand transaction mode: ${String(mode)}`);
  }
}

export function describeOptimisticOperation(
  mode: string,
): OptimisticOperationDescriptor | undefined {
  return mode === "optIn" ? { type: "OPT_IN" } : undefined;
}

export default {
  getTokenFromAsset,
  getAssetFromToken,
  computeIntentType,
  describeOptimisticOperation,
} satisfies BridgeApi;
