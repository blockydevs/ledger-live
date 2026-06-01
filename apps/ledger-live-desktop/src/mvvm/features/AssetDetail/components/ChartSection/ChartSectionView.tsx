import React from "react";
import { LineChart } from "LLD/components/LineChart";
import type { ChartSectionViewModelResult } from "./useChartSectionViewModel";

type ChartSectionViewProps = Readonly<ChartSectionViewModelResult>;

function ChartSectionViewComponent({
  series,
  selectedRange,
  onRangeChange,
  color,
  isLoading,
  isError,
  formatValue,
  tooltipTitle,
  onScrubberPositionChange,
  showXAxis,
  showYAxis,
  xAxis,
  yAxis,
}: ChartSectionViewProps) {
  return (
    <div className="w-full min-w-0" data-testid="asset-detail-chart-section">
      <LineChart
        series={series}
        selectedRange={selectedRange}
        onRangeChange={onRangeChange}
        color={color}
        height={325}
        isLoading={isLoading}
        isError={isError}
        formatValue={formatValue}
        tooltipTitle={tooltipTitle}
        showScrubberTooltip={false}
        onScrubberPositionChange={onScrubberPositionChange}
        showXAxis={showXAxis}
        showYAxis={showYAxis}
        xAxis={xAxis}
        yAxis={yAxis}
      />
    </div>
  );
}

export const ChartSectionView = React.memo(ChartSectionViewComponent);
