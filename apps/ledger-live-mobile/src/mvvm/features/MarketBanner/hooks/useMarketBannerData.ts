import { useEffect, useMemo } from "react";
import { useMarketPerformers } from "@ledgerhq/live-common/market/hooks/useMarketPerformers";
import { useMarketData } from "@ledgerhq/live-common/market/hooks/useMarketDataProvider";
import {
  KeysPriceChange,
  type MarketCurrencyData,
  type MarketItemPerformer,
  Order,
} from "@ledgerhq/live-common/market/utils/types";
import {
  TIME_RANGE,
  MARKET_BANNER_TOP,
  MARKET_PERFORMERS_SUPPORTED,
  MARKET_BANNER_REFRESH_RATE,
} from "@ledgerhq/live-common/market/constants";
import { useDispatch, useSelector } from "~/context/hooks";
import { setMarketBannerRanking } from "~/reducers/marketBanner";
import { counterValueCurrencySelector, starredMarketCoinsSelector } from "~/reducers/settings";
import type { MarketBannerRanking } from "~/reducers/types";
import { MARKET_BANNER_TILE_COUNT } from "../constants";

const LIMIT = MARKET_BANNER_TILE_COUNT * 2;

export type MarketBannerData = {
  data: MarketItemPerformer[];
  isLoading: boolean;
  isError: boolean;
};

function toPerformer(currency: MarketCurrencyData): MarketItemPerformer {
  const change = currency.priceChangePercentage;
  return {
    id: currency.id,
    name: currency.name,
    ticker: currency.ticker,
    priceChangePercentage1h: change[KeysPriceChange.hour] ?? 0,
    priceChangePercentage24h: change[KeysPriceChange.day] ?? 0,
    priceChangePercentage7d: change[KeysPriceChange.week] ?? 0,
    priceChangePercentage30d: change[KeysPriceChange.month] ?? 0,
    priceChangePercentage1y: change[KeysPriceChange.year] ?? 0,
    image: currency.image ?? "",
    price: currency.price,
    ledgerIds: currency.ledgerIds,
  };
}

/**
 * Resolves the market banner items for the active ranking:
 * - trending / gainers → top positive price-change performers
 * - losers → top negative price-change performers
 * - favorites → the user's starred assets
 *
 * If "favorites" is active but the user has no favourite left, it falls back to
 * "trending" and resets the persisted ranking accordingly.
 */
export function useMarketBannerData(ranking: MarketBannerRanking): MarketBannerData {
  const dispatch = useDispatch();
  const counterValueCurrency = useSelector(counterValueCurrencySelector);
  const starredMarketCoins = useSelector(starredMarketCoinsSelector);

  const sortedStarredIds = useMemo(
    () => [...starredMarketCoins].sort((a, b) => a.localeCompare(b)),
    [starredMarketCoins],
  );

  const wantsFavorites = ranking === "favorites";
  const hasStarred = sortedStarredIds.length > 0;
  // Treat favorites as active only when there is something to show, so the empty
  // case falls through to the trending performers instead of flashing an empty list.
  const isFavorites = wantsFavorites && hasStarred;

  useEffect(() => {
    if (wantsFavorites && !hasStarred) {
      dispatch(setMarketBannerRanking("trending"));
    }
  }, [dispatch, wantsFavorites, hasStarred]);

  const performers = useMarketPerformers({
    sort: ranking === "losers" ? "desc" : "asc",
    counterCurrency: counterValueCurrency.ticker,
    range: TIME_RANGE,
    limit: LIMIT,
    top: MARKET_BANNER_TOP,
    supported: MARKET_PERFORMERS_SUPPORTED,
    refreshRate: MARKET_BANNER_REFRESH_RATE,
  });

  const starred = useMarketData({
    counterCurrency: counterValueCurrency.ticker.toLowerCase(),
    range: "24h",
    order: Order.MarketCapDesc,
    limit: LIMIT,
    liveCompatible: true,
    starred: sortedStarredIds,
  });

  const starredItems = useMemo(() => starred.data.map(toPerformer), [starred.data]);

  if (isFavorites) {
    return {
      data: starredItems,
      isLoading: starred.isLoading || starred.isPending,
      isError: starred.isError,
    };
  }

  return {
    data: performers.data ?? [],
    isLoading: performers.isLoading || (performers.isFetching && !performers.data),
    isError: performers.isError && !performers.isFetching,
  };
}
