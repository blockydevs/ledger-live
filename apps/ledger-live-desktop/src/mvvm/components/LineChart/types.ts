import type { Series } from "@ledgerhq/lumen-ui-react-visualization";
import type { ChartRangeSegment } from "@ledgerhq/live-common/market/utils/index";

export type LineChartRange = ChartRangeSegment;

export type LineChartColor = "success" | "error" | "muted";

export type LineChartSeries = Series;

export type LineChartProps = Readonly<{
  series: LineChartSeries[];
  selectedRange: LineChartRange;
  onRangeChange: (range: LineChartRange) => void;
  color?: LineChartColor;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  height?: number;
}>;
