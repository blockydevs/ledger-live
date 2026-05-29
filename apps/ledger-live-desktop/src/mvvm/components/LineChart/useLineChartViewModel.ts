import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_LINE_CHART_HEIGHT,
  LINE_CHART_COLOR_TO_STROKE,
  LINE_CHART_RANGES,
} from "./constants";
import type { LineChartProps, LineChartRange, LineChartSeries } from "./types";

export type LineChartViewModelResult = Readonly<{
  chartSeries: LineChartSeries[];
  height: number;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  selectedRange: LineChartRange;
  handleSelectedChange: (value: string) => void;
  rangeSelectorLabel: string;
  rangeButtons: ReadonlyArray<{ value: LineChartRange; label: string }>;
}>;

export function useLineChartViewModel({
  series,
  selectedRange,
  onRangeChange,
  color = "muted",
  isLoading = false,
  isError = false,
  errorMessage,
  height = DEFAULT_LINE_CHART_HEIGHT,
}: LineChartProps): LineChartViewModelResult {
  const { t } = useTranslation();
  const stroke = LINE_CHART_COLOR_TO_STROKE[color];

  const handleSelectedChange = useCallback(
    (value: string) => {
      onRangeChange(value as LineChartRange);
    },
    [onRangeChange],
  );

  const chartSeries = useMemo(
    () =>
      series.map(entry => ({
        ...entry,
        stroke,
      })),
    [series, stroke],
  );

  const rangeButtons = useMemo(
    () => LINE_CHART_RANGES.map(range => ({ value: range, label: t(`lineChart.range.${range}`) })),
    [t],
  );

  return {
    chartSeries,
    height,
    isLoading,
    isError,
    errorMessage,
    selectedRange,
    handleSelectedChange,
    rangeSelectorLabel: t("lineChart.rangeSelectorLabel"),
    rangeButtons,
  };
}
