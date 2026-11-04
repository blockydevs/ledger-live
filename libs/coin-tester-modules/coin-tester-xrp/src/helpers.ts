import type { Account, AccountBridge, CurrencyBridge } from "@ledgerhq/types-live";
import type { GetAddressFn } from "@ledgerhq/ledger-wallet-framework/bridge/getAddressWrapper";
import type { SignerContext } from "@ledgerhq/ledger-wallet-framework/signer";
import { getCoinFrameworkCurrencyBridge } from "@ledgerhq/live-common/bridge/generic-coin-framework/currencyBridge";
import { getCoinFrameworkAccountBridge } from "@ledgerhq/live-common/bridge/generic-coin-framework/accountBridge";
import type { GenericTransaction } from "@ledgerhq/live-common/bridge/generic-coin-framework/types";
import xrpResolver from "@ledgerhq/live-common/families/xrp/getAddress";
import type { XrpSigner } from "@ledgerhq/live-common/families/xrp/types";
import { registerCoinModules } from "@ledgerhq/live-common/coin-modules/registry";
import { coinModuleLoaders } from "@ledgerhq/live-common/coin-modules/loaders";
import { LiveConfig } from "@ledgerhq/live-config/LiveConfig";
import { XRP_LOCAL_RPC } from "./fixtures";

registerCoinModules(coinModuleLoaders);

export type XrpTokenStandard = "iou" | "mpt";

/** The bridges are keyed by coin family, not by currency id. */
const FAMILY = "xrp";

/**
 * Get the bridges for the XRP family.
 */
export async function getBridges(signer: XrpSigner): Promise<{
  currencyBridge: CurrencyBridge;
  accountBridge: AccountBridge<GenericTransaction>;
  getAddress: GetAddressFn;
}> {
  const context: SignerContext<XrpSigner> = (_, fn) => fn(signer);
  const getAddress = xrpResolver(context);

  return {
    currencyBridge: await getCoinFrameworkCurrencyBridge(FAMILY, "local", { context, getAddress }),
    accountBridge: await getCoinFrameworkAccountBridge(FAMILY, "local", { context, getAddress }),
    getAddress,
  };
}

/**
 * Points the `ripple` currency at the local rippled. `enabledTokenStandards` left out means the
 * field is absent from the config, which turns every token standard off.
 */
export function setLocalXrpConfig(enabledTokenStandards?: XrpTokenStandard[]): void {
  LiveConfig.setConfig({
    config_currency_ripple: {
      type: "object",
      default: {
        status: { type: "active" },
        name: "XRP",
        unit: { name: "XRP", code: "XRP", magnitude: 6 },
        node: XRP_LOCAL_RPC,
        ...(enabledTokenStandards ? { enabledTokenStandards } : {}),
      },
    },
  });
}

/** Runs a full sync of `account` and returns the synced account. */
export function syncAccount(
  accountBridge: AccountBridge<GenericTransaction>,
  account: Account,
): Promise<Account> {
  return new Promise((resolve, reject) => {
    let synced = account;
    accountBridge.sync(account, { paginationConfig: {} }).subscribe({
      next: update => {
        synced = update(synced);
      },
      error: reject,
      complete: () => resolve(synced),
    });
  });
}
