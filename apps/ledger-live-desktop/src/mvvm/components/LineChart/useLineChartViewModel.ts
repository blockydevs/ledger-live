import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import {
  LINE_CHART_RANGES,
  DEFAULT_LINE_CHART_HEIGHT,
  CHART_OVERFLOW_BUFFER,
  LINE_CHART_COLOR_TO_STROKE,
} from "./constants";
import type { LineChartProps, LineChartRange, LineChartSeries } from "./types";

export type LineChartViewModelResult = Readonly<{
  chartWrapperRef: RefObject<HTMLDivElement | null>;
  chartSeries: LineChartSeries[];
  chartWidth: number | null;
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

  const chartWrapperRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number | null>(null);

  useEffect(() => {
    const element = chartWrapperRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

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

  const chartWidth = containerWidth != null ? containerWidth + CHART_OVERFLOW_BUFFER * 2 : null;

  const rangeButtons = useMemo(
    () => LINE_CHART_RANGES.map(range => ({ value: range, label: t(`lineChart.range.${range}`) })),
    [t],
  );

  return {
    chartWrapperRef,
    chartSeries,
    chartWidth,
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
