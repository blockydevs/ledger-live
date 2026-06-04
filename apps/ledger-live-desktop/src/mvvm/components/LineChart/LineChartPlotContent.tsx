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
  chartWidth: number | null;
  chartSeries: LineChartSeries[];
}>;

export function LineChartPlotContent({
  height,
  isLoading,
  isError,
  errorMessage,
  chartWidth,
  chartSeries,
}: LineChartPlotContentProps) {
  if (isError) {
    return <LineChartError height={height} message={errorMessage} />;
  }

  if (isLoading || chartWidth == null) {
    return <LineChartLoading height={height} />;
  }

  return <LumenLineChart series={chartSeries} height={height} width={chartWidth} showArea />;
}
