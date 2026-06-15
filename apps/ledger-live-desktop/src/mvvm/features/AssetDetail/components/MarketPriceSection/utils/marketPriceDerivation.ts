import { KeysPriceChange } from "@ledgerhq/live-common/market/utils/types";
import type { LineChartRange } from "LLD/components/LineChart";

export const DAY_CHANGE_PERCENT_NEAR_ZERO_EPSILON = 0.01;

export type TrendVariant = "positive" | "negative" | "neutral";

const RANGE_TO_PRICE_CHANGE_KEY: Partial<Record<LineChartRange, KeysPriceChange>> = {
  "1d": KeysPriceChange.day,
  "1w": KeysPriceChange.week,
  "1m": KeysPriceChange.month,
  "6m": KeysPriceChange.sixMonths,
  "1y": KeysPriceChange.year,
  "5y": KeysPriceChange.year,
};

const CHART_DERIVED_PRICE_CHANGE_RANGES = new Set<LineChartRange>(["all"]);

export function isChartDerivedPriceChangeRange(range: LineChartRange): boolean {
  return CHART_DERIVED_PRICE_CHANGE_RANGES.has(range);
}

export function getPriceChangeKeyForRange(range: LineChartRange): KeysPriceChange | undefined {
  return RANGE_TO_PRICE_CHANGE_KEY[range];
}

export function getChartRangeVariation(
  prices: readonly number[],
): { percentage: number; variationFiat: number } | undefined {
  if (prices.length < 2) return undefined;
  const first = prices[0];
  const last = prices[prices.length - 1];
  if (!Number.isFinite(first) || !Number.isFinite(last)) return undefined;
  const variationFiat = last - first;
  const percentage = first === 0 ? 0 : (variationFiat / first) * 100;
  return { percentage, variationFiat };
}

export type RangePriceChange = Readonly<{
  percentage: number | null | undefined;
  variationFiat: number | undefined;
}>;

export function resolveRangePriceChange(options: {
  selectedRange: LineChartRange;
  chartPrices: readonly number[];
  price?: number;
  priceChangePercentage?: Record<KeysPriceChange, number>;
}): RangePriceChange {
  const { selectedRange, chartPrices, price, priceChangePercentage } = options;

  if (isChartDerivedPriceChangeRange(selectedRange)) {
    const derived = getChartRangeVariation(chartPrices);
    if (derived == null) return { percentage: undefined, variationFiat: undefined };
    return {
      percentage: clampDayChangePercentPointsNearZero(derived.percentage),
      variationFiat: derived.variationFiat,
    };
  }

  const key = getPriceChangeKeyForRange(selectedRange);
  const percentage = clampDayChangePercentPointsNearZero(
    key != null ? priceChangePercentage?.[key] : undefined,
  );
  return {
    percentage,
    variationFiat: getFiatPriceVariationFromPercentChange(price, percentage),
  };
}

/** Implied fiat delta from current spot price and a percent change (e.g. 24h %) in percent points. */
export function getFiatPriceVariationFromPercentChange(
  price?: number,
  dayPercentage?: number | null,
): number | undefined {
  if (price == null || dayPercentage == null) return undefined;
  const denominator = 1 + dayPercentage / 100;
  if (denominator === 0) return undefined;
  const previousPrice = price / denominator;
  const variation = price - previousPrice;
  if (Number.isNaN(variation)) return undefined;
  return variation;
}

export function clampDayChangePercentPointsNearZero(
  dayPercentage: number | null | undefined,
  epsilon = DAY_CHANGE_PERCENT_NEAR_ZERO_EPSILON,
): number | null | undefined {
  if (dayPercentage == null) return dayPercentage;
  return Math.abs(dayPercentage) < epsilon ? 0 : dayPercentage;
}

/**
 * Variation between the start of the selected range and a scrubbed point.
 * `percentage` is a fraction (e.g. 0.05 = +5%); `variationFiat` is the raw delta.
 */
export function getScrubVariation(
  baselinePrice: number,
  scrubbedPrice: number,
): { percentage: number; variationFiat: number } {
  const variationFiat = scrubbedPrice - baselinePrice;
  const percentage = baselinePrice !== 0 ? variationFiat / baselinePrice : 0;
  return { percentage, variationFiat };
}

export function resolveTrendPercentAndVariant(options: {
  hasVariationData: boolean;
  trendPercentageText: string;
  trendVariant: TrendVariant;
}): { percentageText: string; variationVariant: TrendVariant } {
  const { hasVariationData, trendPercentageText, trendVariant } = options;
  if (hasVariationData) {
    const isNegativeZero =
      trendPercentageText !== "***" && /^-0[.,]00%$/.test(trendPercentageText.trim());
    if (isNegativeZero) {
      return { percentageText: "0.00%", variationVariant: "neutral" };
    }
    return { percentageText: trendPercentageText, variationVariant: trendVariant };
  }
  return { percentageText: "—", variationVariant: "neutral" };
}
