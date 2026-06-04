import { useMemo, useState } from "react";
import type { AssetMarketData } from "@ledgerhq/asset-detail";
import { KeysPriceChange } from "@ledgerhq/live-common/market/utils/types";
import {
  resolveLineChartColorFromPercentChange,
  type LineChartColor,
  type LineChartRange,
  type LineChartSeries,
} from "LLD/components/LineChart";
import { clampDayChangePercentPointsNearZero } from "../MarketPriceSection/utils";

type UseChartSectionViewModelProps = Readonly<{
  marketData: AssetMarketData;
  ledgerId?: string;
  isDistributionLoading: boolean;
}>;

export type ChartSectionViewModelResult = Readonly<{
  series: LineChartSeries[];
  selectedRange: LineChartRange;
  onRangeChange: (range: LineChartRange) => void;
  color: LineChartColor;
  isLoading: boolean;
  isError: boolean;
}>;

const PLACEHOLDER_SERIES: LineChartSeries[] = [
  {
    id: "asset-detail-price-preview",
    data: [
      1, 2, 5, 12, 56, 3, 33, 34, 56, 55, 100, 101, 102, 103, 12, 105, 106, 107, 108, 109, 110,
    ],
    label: "Price",
    // Stroke is required by Series typing but is always overridden by <LineChart /> from `color`.
    stroke: "",
  },
];

export function useChartSectionViewModel({
  marketData,
}: UseChartSectionViewModelProps): ChartSectionViewModelResult {
  const [selectedRange, setSelectedRange] = useState<LineChartRange>("1D");

  const onRangeChange = (range: LineChartRange) => {
    setSelectedRange(range);
  };

  const series = useMemo(() => PLACEHOLDER_SERIES, []);

  const dayPercentage = marketData.marketCurrencyData?.priceChangePercentage?.[KeysPriceChange.day];
  const color = resolveLineChartColorFromPercentChange(
    clampDayChangePercentPointsNearZero(dayPercentage),
  );

  return {
    series,
    selectedRange,
    onRangeChange,
    color,
    isLoading: false,
    isError: false,
  };
}
