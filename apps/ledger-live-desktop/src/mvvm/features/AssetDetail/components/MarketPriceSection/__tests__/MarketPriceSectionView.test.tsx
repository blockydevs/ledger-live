import React from "react";
import { render, screen } from "tests/testSetup";
import { MarketPriceSectionView } from "../MarketPriceSectionView";
import type { MarketPriceSectionViewModelResult } from "../useMarketPriceSectionViewModel";

const baseViewModel: MarketPriceSectionViewModelResult = {
  title: "Market price",
  rangeLabel: "1 day",
  priceValue: 12.34,
  priceFormatter: jest.fn() as unknown as MarketPriceSectionViewModelResult["priceFormatter"],
  variationText: "$0.22",
  percentageText: "+1.80%",
  variationVariant: "positive" as const,
  showSkeleton: false,
  hasPriceData: true,
  hasVariationData: true,
};

describe("MarketPriceSectionView", () => {
  it("shows a longer placeholder and day label when market price is unavailable", () => {
    render(
      <MarketPriceSectionView
        {...baseViewModel}
        hasPriceData={false}
        hasVariationData={false}
        priceValue={undefined}
      />,
    );

    expect(screen.getByTestId("asset-detail-market-price")).toHaveTextContent("-----");
    expect(screen.queryByTestId("asset-detail-market-price-percent")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("asset-detail-market-price-fiat-variation"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("1 day")).toBeVisible();
  });
});
