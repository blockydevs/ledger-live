import type { AssetInfo } from "@ledgerhq/coin-module-framework/api/types";
import { getCryptoAssetsStore } from "@ledgerhq/cryptoassets/state";
import { BridgeApi } from "@ledgerhq/ledger-wallet-framework/api/types";
import type { CryptoCurrency, TokenCurrency } from "@ledgerhq/types-cryptoassets";

// Cardano native assets are keyed by `<policyId><assetName>` — the same assetReference
// getBalance/listOperations/craftTransaction use — stored on the TokenCurrency's contractAddress.
// A Cardano asset is a token iff it carries an assetReference (mirrors coin-cardano's isTokenAsset,
// which can't be imported across the package boundary): `asset.type` is unreliable here — CAL types
// native tokens as tokenType "native" (so intent assets are type "native") while getBalance emits
// them as type "token". Only plain ADA ever lacks an assetReference.
export async function getTokenFromAsset(
  currency: CryptoCurrency,
  asset: AssetInfo,
): Promise<TokenCurrency | undefined> {
  if (!("assetReference" in asset) || !asset.assetReference) {
    return undefined;
  }
  return getCryptoAssetsStore().findTokenByAddressInCurrency(asset.assetReference, currency.id);
}

export function getAssetFromToken(token: TokenCurrency, owner: string): AssetInfo {
  return {
    type: token.tokenType,
    assetReference: token.contractAddress,
    assetOwner: owner,
    name: token.name,
    unit: token.units[0],
  };
}

// No computeIntentType: staking modes (delegate/undelegate) flow correctly through the
// framework default (which preserves transaction.mode + valAddress on the intent), so a custom
// mapping would only risk diverging from that proven path.
export default function cardanoBridge(currency: CryptoCurrency): BridgeApi {
  return {
    getTokenFromAsset: async (asset: AssetInfo) => getTokenFromAsset(currency, asset),
    getAssetFromToken: (token: TokenCurrency, owner: string) => getAssetFromToken(token, owner),
  };
}
