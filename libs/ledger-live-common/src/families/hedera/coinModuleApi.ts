import { createApi as createHederaApi } from "@ledgerhq/coin-hedera/api/index";
import type { HederaCoinConfig } from "@ledgerhq/coin-hedera/config";
import type { CoinModuleApi } from "@ledgerhq/coin-module-framework/api/types";
import type { BridgeApi } from "@ledgerhq/ledger-wallet-framework/api/types";
import { getCurrencyConfiguration } from "../../config";

export function createLocalHederaApi(currencyId: string): CoinModuleApi<any> & BridgeApi {
  return createHederaApi(
    getCurrencyConfiguration<HederaCoinConfig>(currencyId),
    currencyId,
  ) as CoinModuleApi<any> & BridgeApi;
}
