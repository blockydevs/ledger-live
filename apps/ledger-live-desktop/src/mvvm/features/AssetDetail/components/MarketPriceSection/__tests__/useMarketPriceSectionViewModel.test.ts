import type { AssetMarketData } from "@ledgerhq/asset-detail";
import { createMockMarketCurrencyData } from "@ledgerhq/live-common/market/utils/fixtures";
import { KeysPriceChange } from "@ledgerhq/live-common/market/utils/types";
import { renderHook } from "tests/testSetup";
import { useMarketPriceSectionViewModel } from "../useMarketPriceSectionViewModel";

const baseMarketCurrencyData = createMockMarketCurrencyData();

const marketData: AssetMarketData = {
  marketId: "bitcoin",
  isLoading: false,
  marketCurrencyData: createMockMarketCurrencyData({
    price: 100,
    priceChangePercentage: {
      ...baseMarketCurrencyData.priceChangePercentage,
      [KeysPriceChange.day]: 10,
    },
  }),
};

describe("useMarketPriceSectionViewModel", () => {
  it("shows day change percentage and fiat variation in discreet mode", () => {
    const { result } = renderHook(
      () =>
        useMarketPriceSectionViewModel({
          ledgerId: "bitcoin",
          marketData,
          isDistributionLoading: false,
        }),
      {
        initialState: {
          settings: { counterValue: "USD", locale: "en-US", discreetMode: true },
        },
      },
    );

    expect(result.current.percentageText).toBe("+10.00%");
    expect(result.current.variationText).toMatch(/^\+/);
    expect(result.current.variationText).not.toBe("—");
    expect(result.current.variationText).not.toBe("***");
  });
});
