import React from "react";
import { LineChartPlotContent, type LineChartPlotContentProps } from "./LineChartPlotContent";

type LineChartPlotProps = LineChartPlotContentProps &
  Readonly<{
    chartWrapperRef: React.RefObject<HTMLDivElement | null>;
  }>;

export function LineChartPlot({ chartWrapperRef, ...contentProps }: LineChartPlotProps) {
  return (
    <div ref={chartWrapperRef} className="w-full min-w-0">
      <LineChartPlotContent {...contentProps} />
    </div>
  );
}
