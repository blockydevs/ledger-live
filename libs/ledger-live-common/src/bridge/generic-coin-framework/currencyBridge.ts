import { defer, switchMap } from "rxjs";
import { log } from "@ledgerhq/logs";
import { makeScanAccounts } from "@ledgerhq/ledger-wallet-framework/bridge/jsHelpers";
import type { IterateResultBuilder } from "@ledgerhq/ledger-wallet-framework/bridge/jsHelpers";
import type { CurrencyBridge } from "@ledgerhq/types-live";
import { getBridgeApi } from "./bridge";
import { genericGetAccountShape } from "./getAccountShape";
import { getSigner } from "./signer";
import type { CoinFrameworkSigner } from "./types";
import { postSync } from "./postSync";

export async function getCoinFrameworkCurrencyBridge(
  network: string,
  kind: string,
  customSigner?: CoinFrameworkSigner,
): Promise<CurrencyBridge> {
  const signer = customSigner ?? (await getSigner(network));
  const getAddressFn = signer.getAddress.bind(signer);

  // A family's bridge api can be a function of the currency, and the currency is only known
  // once `scanAccounts` is invoked, so `buildIterateResult` is resolved per call instead of once
  // here. Leaving it `undefined` (no hook declared, or the `bridge/api` module fails to load)
  // makes `makeScanAccounts` fall back to its own device-path-derived default.
  const scanAccounts: CurrencyBridge["scanAccounts"] = opts =>
    defer(async (): Promise<IterateResultBuilder | undefined> => {
      try {
        const bridgeApi = await getBridgeApi(opts.currency, network);
        return bridgeApi.buildIterateResult;
      } catch (e) {
        log(
          "warn",
          `scanAccounts: falling back to the default iterate result builder for ${network}`,
          e,
        );
        return undefined;
      }
    }).pipe(
      switchMap(buildIterateResult =>
        makeScanAccounts({
          getAccountShape: genericGetAccountShape(network, kind),
          getAddressFn,
          postSync,
          buildIterateResult,
        })(opts),
      ),
    );

  return { scanAccounts };
}
