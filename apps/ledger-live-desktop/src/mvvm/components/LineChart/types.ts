import type { Series } from "@ledgerhq/lumen-ui-react-visualization";

export type LineChartRange = "1D" | "1W" | "1M" | "6M" | "1Y" | "5Y" | "ALL";

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
