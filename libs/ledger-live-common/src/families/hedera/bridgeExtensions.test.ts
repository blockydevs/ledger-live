import { genAccount } from "@ledgerhq/ledger-wallet-framework/mocks/account";
import { HEDERA_DUMMY_ADDRESS } from "@ledgerhq/coin-hedera/constants";
import { loadBridgeExtensionsForFamily } from "../../coin-modules/registry";
import { getCryptoCurrencyById } from "../../currencies";

describe("hedera bridgeExtensions", () => {
  const hederaAccount = genAccount("hedera-1", { currency: getCryptoCurrencyById("hedera") });

  it("supplies an estimation recipient for hedera", async () => {
    const extensions = await loadBridgeExtensionsForFamily("hedera");
    expect(extensions.getEstimationRecipient?.(hederaAccount)).toBe(HEDERA_DUMMY_ADDRESS);
  });
});
