import React from "react";
import { LineChart as LumenLineChart } from "@ledgerhq/lumen-ui-react-visualization";
import { LineChartLoading } from "./LineChartLoading";
import { LineChartError } from "./LineChartError";
import type { LineChartSeries } from "./types";

export type LineChartPlotContentProps = Readonly<{
  height: number;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  chartSeries: LineChartSeries[];
}>;

export function LineChartPlotContent({
  height,
  isLoading,
  isError,
  errorMessage,
  chartSeries,
}: LineChartPlotContentProps) {
  if (isError) {
    return <LineChartError height={height} message={errorMessage} />;
  }

  if (isLoading) {
    return <LineChartLoading height={height} />;
  }

  return (
    <div data-testid="line-chart-plot" className="w-full min-w-0">
      <LumenLineChart series={chartSeries} height={height} width="100%" showArea />
    </div>
  );
}
