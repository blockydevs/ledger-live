import { cssVar } from "@ledgerhq/lumen-design-core";
import type { LineChartColor, LineChartRange } from "./types";

export const LINE_CHART_RANGES: readonly LineChartRange[] = [
  "1D",
  "1W",
  "1M",
  "6M",
  "1Y",
  "5Y",
  "ALL",
];

export const DEFAULT_LINE_CHART_HEIGHT = 240;

export const CHART_OVERFLOW_BUFFER = 50;

export const LINE_CHART_COLOR_TO_STROKE = {
  success: cssVar("var(--color-background-success-strong)"),
  error: cssVar("var(--color-background-error-strong)"),
  muted: cssVar("var(--color-background-muted-strong)"),
} as const satisfies Record<LineChartColor, string>;
