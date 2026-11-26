import { createApi as createMultiversxApi } from "@ledgerhq/coin-multiversx/api";
import type { CoinModuleApi } from "@ledgerhq/coin-module-framework/api/types";

export function createLocalMultiversxApi(_currencyId: string): CoinModuleApi<any> {
  return createMultiversxApi() as CoinModuleApi<any>;
}
