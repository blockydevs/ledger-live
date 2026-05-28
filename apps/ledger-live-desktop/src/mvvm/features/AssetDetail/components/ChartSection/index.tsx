import React from "react";
import type { AssetMarketData } from "@ledgerhq/asset-detail";
import { ChartSectionView } from "./ChartSectionView";
import { useChartSectionViewModel } from "./useChartSectionViewModel";

type ChartSectionProps = Readonly<{
  marketData: AssetMarketData;
  ledgerId?: string;
  isDistributionLoading: boolean;
}>;

export function ChartSection(props: ChartSectionProps) {
  const viewModel = useChartSectionViewModel(props);
  return <ChartSectionView {...viewModel} />;
}
