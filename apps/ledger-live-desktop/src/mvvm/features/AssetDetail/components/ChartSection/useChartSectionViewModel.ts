import { useMemo } from "react";
import type { AssetMarketData } from "@ledgerhq/asset-detail";
import { useAssetChartData } from "@ledgerhq/live-common/market/hooks/useMarketDataProvider";
import { useSelector } from "LLD/hooks/redux";
import {
  resolveLineChartColorFromPercentChange,
  type LineChartColor,
  type LineChartRange,
  type LineChartSeries,
} from "LLD/components/LineChart";
import { counterValueCurrencySelector } from "~/renderer/reducers/settings";
import {
  clampDayChangePercentPointsNearZero,
  getPriceChangeKeyForRange,
} from "../MarketPriceSection/utils";

type UseChartSectionViewModelProps = Readonly<{
  marketData: AssetMarketData;
  ledgerId?: string;
  isDistributionLoading: boolean;
  selectedRange: LineChartRange;
  onRangeChange: (range: LineChartRange) => void;
}>;

export type ChartSectionViewModelResult = Readonly<{
  series: LineChartSeries[];
  selectedRange: LineChartRange;
  onRangeChange: (range: LineChartRange) => void;
  color: LineChartColor;
  isLoading: boolean;
  isError: boolean;
}>;

export function useChartSectionViewModel({
  marketData,
  ledgerId,
  selectedRange,
  onRangeChange,
}: UseChartSectionViewModelProps): ChartSectionViewModelResult {
  const counterCurrency = useSelector(counterValueCurrencySelector).ticker.toLowerCase();

  const id =
    ledgerId ?? marketData.marketCurrencyData?.ledgerIds?.[0] ?? marketData.marketCurrencyData?.id;

  const {
    data: chartData,
    isLoading,
    isError,
  } = useAssetChartData({ id, counterCurrency, range: selectedRange }, { skip: !id });

  const series = useMemo<LineChartSeries[]>(() => {
    const points = chartData?.[selectedRange] ?? [];
    return [
      {
        id: "asset-detail-price",
        data: points.map(([, value]) => value),
        label: "Price",
        // Stroke is required by Series typing but is always overridden by <LineChart /> from `color`.
        stroke: "",
      },
    ];
  }, [chartData, selectedRange]);

  const priceChangeKey = getPriceChangeKeyForRange(selectedRange);
  const rangePercentage = marketData.marketCurrencyData?.priceChangePercentage?.[priceChangeKey];
  const color = resolveLineChartColorFromPercentChange(
    clampDayChangePercentPointsNearZero(rangePercentage),
  );

  return {
    series,
    selectedRange,
    onRangeChange,
    color,
    isLoading,
    isError,
  };
}
