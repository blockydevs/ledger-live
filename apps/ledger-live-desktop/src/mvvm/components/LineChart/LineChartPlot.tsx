import React from "react";
import { LineChart as LumenLineChart } from "@ledgerhq/lumen-ui-react-visualization";
import { LineChartLoading } from "./LineChartLoading";
import { LineChartError } from "./LineChartError";
import type { LineChartSeries } from "./types";

type LineChartPlotProps = Readonly<{
  chartWrapperRef: React.RefObject<HTMLDivElement | null>;
  height: number;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  chartWidth: number | null;
  chartSeries: LineChartSeries[];
}>;

export function LineChartPlot({
  chartWrapperRef,
  height,
  isLoading,
  isError,
  errorMessage,
  chartWidth,
  chartSeries,
}: LineChartPlotProps) {
  return (
    <div ref={chartWrapperRef} className="w-full min-w-0">
      {isError ? (
        <LineChartError height={height} message={errorMessage} />
      ) : isLoading || chartWidth == null ? (
        <LineChartLoading height={height} />
      ) : (
        <LumenLineChart series={chartSeries} height={height} width={chartWidth} showArea />
      )}
    </div>
  );
}
