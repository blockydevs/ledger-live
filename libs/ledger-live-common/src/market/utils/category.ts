import type { MarketCurrencyData } from "./types";

/** Categories the Market list can be filtered by (shared by desktop & mobile). */
export type MarketListCategory = "all" | "starred" | "stocks";

const MARKET_LIST_CATEGORIES = new Set<MarketListCategory>(["all", "starred", "stocks"]);

/** Backend `filter` value used to request the tokenized-stocks list. */
export const STOCK_MARKET_FILTER = "stock";

/** Parses an arbitrary value (deeplink param, persisted state…) into a known category. */
export function parseMarketListCategory(category: unknown): MarketListCategory | undefined {
  if (typeof category !== "string") {
    return undefined;
  }

  const normalizedCategory = category.trim().toLowerCase() as MarketListCategory;

  return MARKET_LIST_CATEGORIES.has(normalizedCategory) ? normalizedCategory : undefined;
}

/** Returns the backend `filter` param to send for the given category, if any. */
export function getMarketFilter(isStocksCategory: boolean): string | undefined {
  return isStocksCategory ? STOCK_MARKET_FILTER : undefined;
}

/**
 * Client-side guard: the backend `stock` filter is not yet exhaustive, so we
 * additionally keep only tokenized-stock currencies.
 */
export function isStockMarketCurrency(item: MarketCurrencyData): boolean {
  const id = item.id.toLowerCase();
  const name = item.name.toLowerCase();

  return (
    id.includes("xstock") ||
    id.includes("tokenized-stock") ||
    id.includes("prestocks") ||
    name.includes("xstock") ||
    name.includes("tokenized stock") ||
    name.includes("prestocks")
  );
}
