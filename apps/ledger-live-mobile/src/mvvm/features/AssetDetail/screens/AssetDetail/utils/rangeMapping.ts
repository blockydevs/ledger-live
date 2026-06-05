import { KeysPriceChange } from "@ledgerhq/live-common/market/utils/types";

// Range buckets surfaced in the BalanceGraph segmented control.
export const BALANCE_GRAPH_RANGES = ["1d", "1w", "1m", "1y", "all"] as const;

export type RangeKey = (typeof BALANCE_GRAPH_RANGES)[number];

const RANGE_KEY_SET: ReadonlySet<string> = new Set(BALANCE_GRAPH_RANGES);

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Target spacing between rendered chart points per range (LIVE-31777). Mobile
 * uses coarser granularity than desktop for render performance. The market API
 * serves equal-or-finer resolution for every range, so the resampler only ever
 * coarsens toward these targets (it never adds resolution).
 */
export const RANGE_TARGET_INTERVAL_MS: Record<RangeKey, number> = {
  "1d": 10 * MINUTE_MS,
  // 2h rather than the 1.5h baseline: hourly source data cannot yield 1.5h, so
  // we coarsen to the next clean multiple (×2).
  "1w": 2 * HOUR_MS,
  "1m": 6 * HOUR_MS,
  "1y": 3 * DAY_MS,
  all: 30 * DAY_MS,
};

export const RANGE_TO_PRICE_CHANGE_KEY: Partial<Record<RangeKey, KeysPriceChange>> = {
  "1d": KeysPriceChange.day,
  "1w": KeysPriceChange.week,
  "1m": KeysPriceChange.month,
  "1y": KeysPriceChange.year,
};

const CHART_DERIVED_PRICE_CHANGE_RANGES = new Set<RangeKey>(["all"]);

export function isChartDerivedPriceChangeRange(range: RangeKey): boolean {
  return CHART_DERIVED_PRICE_CHANGE_RANGES.has(range);
}

export function computeChartRangeChangePercentage(prices: readonly number[]): number | undefined {
  if (prices.length < 2) return undefined;
  const first = prices[0];
  const last = prices[prices.length - 1];
  if (first === 0) return 0;
  return ((last - first) / first) * 100;
}

export function isRangeKey(value: string): value is RangeKey {
  return RANGE_KEY_SET.has(value);
}
