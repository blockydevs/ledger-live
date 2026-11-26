import { createApi as createAlgorandApi } from "@ledgerhq/coin-algorand/api";
import type { CoinModuleApi } from "@ledgerhq/coin-module-framework/api/types";
import type { BridgeApi } from "@ledgerhq/ledger-wallet-framework/api/types";

export function createLocalAlgorandApi(_currencyId: string): CoinModuleApi<any> & BridgeApi {
  return createAlgorandApi() as CoinModuleApi<any> & BridgeApi;
}
