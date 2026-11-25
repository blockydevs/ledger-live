import { multiversxDefaults } from "@ledgerhq/coin-multiversx/config";
import type { ConfigSchema } from "@ledgerhq/live-config/LiveConfig";
import { currencyDefaultsToLiveConfig } from "../../config";

/** Routes MultiversX through the generic coin framework (`bridge/impl.ts`). */
export const MULTIVERSX_GENERIC_BRIDGE_KEY = "config_multiversx_generic_bridge";

export const multiversxConfig: ConfigSchema = {
  [MULTIVERSX_GENERIC_BRIDGE_KEY]: {
    type: "boolean",
    default: false,
  },
  ...currencyDefaultsToLiveConfig(multiversxDefaults),
};
