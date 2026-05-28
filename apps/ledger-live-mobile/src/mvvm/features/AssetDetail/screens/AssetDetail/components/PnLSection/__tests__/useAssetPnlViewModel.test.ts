import { getCryptoCurrencyById } from "@ledgerhq/cryptoassets";
import { genAccount } from "@ledgerhq/live-common/mock/account";
import type { DistributionItem } from "@ledgerhq/types-live";
import * as walletPnlHooks from "@ledgerhq/wallet-pnl/hooks";
import { renderHook, withFlagOverrides } from "@tests/test-renderer";
import { useAssetPnlViewModel } from "../useAssetPnlViewModel";

const btc = getCryptoCurrencyById("bitcoin");
const btcAccount = genAccount("btc-1", { currency: btc, operationsSize: 0 });

const distributionItem: DistributionItem = {
  currency: btc,
  distribution: 1,
  accounts: [btcAccount],
  amount: 0,
};

const withPnlFlag = (enabled: boolean) =>
  withFlagOverrides({ lwmWallet40: { enabled: true, params: { pnl: enabled } } });

describe("useAssetPnlViewModel", () => {
  let spy: jest.SpyInstance<
    ReturnType<typeof walletPnlHooks.useAssetGroupPnL>,
    Parameters<typeof walletPnlHooks.useAssetGroupPnL>
  >;

  beforeEach(() => {
    spy = jest.spyOn(walletPnlHooks, "useAssetGroupPnL");
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it("forwards the distribution accounts to useAssetGroupPnL when enabled", () => {
    renderHook(() => useAssetPnlViewModel({ distributionItem, enabled: true }), {
      overrideInitialState: withPnlFlag(true),
    });

    expect(spy).toHaveBeenCalledWith(
      distributionItem.accounts,
      expect.anything(),
      expect.anything(),
    );
  });

  it("short-circuits to an empty accounts list when disabled", () => {
    renderHook(() => useAssetPnlViewModel({ distributionItem, enabled: false }), {
      overrideInitialState: withPnlFlag(true),
    });

    expect(spy).toHaveBeenCalledWith([], expect.anything(), expect.anything());
  });

  it("falls back to a zero average entry price when useAssetGroupPnL returns null", () => {
    spy.mockReturnValue(null);

    const { result } = renderHook(() => useAssetPnlViewModel({ distributionItem, enabled: true }), {
      overrideInitialState: withPnlFlag(true),
    });

    expect(result.current.secondary.value).toMatch(/0(?:[.,]00)?/);
  });
});
