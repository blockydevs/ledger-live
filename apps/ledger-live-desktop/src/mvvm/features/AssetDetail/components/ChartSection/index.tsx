import React from "react";
import type { AssetMarketData } from "@ledgerhq/asset-detail";
import type { LineChartRange } from "LLD/components/LineChart";
import { ChartSectionView } from "./ChartSectionView";
import { useChartSectionViewModel } from "./useChartSectionViewModel";

type ChartSectionProps = Readonly<{
  marketData: AssetMarketData;
  ledgerId?: string;
  currencyId?: string;
  isDistributionLoading: boolean;
  selectedRange: LineChartRange;
  onRangeChange: (range: LineChartRange) => void;
}>;

export function ChartSection(props: ChartSectionProps) {
  const viewModel = useChartSectionViewModel(props);
  return <ChartSectionView {...viewModel} />;
}
