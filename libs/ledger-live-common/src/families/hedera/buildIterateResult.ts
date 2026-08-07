import type { IterateResultBuilder } from "@ledgerhq/ledger-wallet-framework/bridge/jsHelpers";
import { runDerivationScheme } from "@ledgerhq/ledger-wallet-framework/derivation";
import { apiClient } from "@ledgerhq/coin-hedera/network/api";
import type { HederaCoinConfig } from "@ledgerhq/coin-hedera/config";
import { getCurrencyConfiguration } from "../../config";

// Hedera has no derivation-based address: the on-chain account id (0.0.x) is
// assigned by the network and only discoverable by asking the mirror node
// which account ids were created for the device's public key.
export const hederaBuildIterateResult: IterateResultBuilder = async ({ result: rootResult }) => {
  return async ({ currency, derivationScheme, index }) => {
    const mirrorAccounts = await apiClient.getAccountsForPublicKey({
      // The config is read here rather than resolved from the currency id, because the coin
      // module's own config store is only populated on the legacy path.
      configOrCurrencyId: getCurrencyConfiguration<HederaCoinConfig>(currency.id),
      publicKey: rootResult.publicKey,
    });

    const addresses = mirrorAccounts.map(a => a.account);
    const freshAddressPath = runDerivationScheme(derivationScheme, currency, { account: index });

    return addresses[index]
      ? {
          address: addresses[index],
          // The framework stores this as the account `xpub`; it must stay the device public
          // key, not the account id, which already lives in `address`.
          publicKey: rootResult.publicKey,
          path: freshAddressPath,
        }
      : null;
  };
};
