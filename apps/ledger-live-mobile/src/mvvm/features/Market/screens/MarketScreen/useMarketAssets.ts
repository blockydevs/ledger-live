import { useCallback, useEffect, useMemo, useState } from "react";
import { useMarketData } from "@ledgerhq/live-common/market/hooks/useMarketDataProvider";
import type { MarketCurrencyData } from "@ledgerhq/live-common/market/utils/types";
import { useLocale, useTranslation } from "~/context/Locale";
import { useSelector } from "~/context/hooks";
import { counterValueCurrencySelector } from "~/reducers/settings";
import type {
  MarketListCategory,
  MarketListFilterTimeframe,
  MarketListSorting,
} from "~/reducers/types";
import type { MarketAssetDisplayData } from "LLM/components/AssetListItem";
import { mapMarketCurrencyToDisplayData } from "../../utils/marketAssetDisplay";
import {
  getMarketListDisplayRange,
  getMarketListOrder,
  getMarketListRequestRange,
} from "./marketListFilters";

const PAGE_SIZE = 20;
const EMPTY_MARKET_DATA: MarketCurrencyData[] = [];

export type MarketAssetsParams = {
  search?: string;
  category?: MarketListCategory;
  sorting?: MarketListSorting;
  timeframe?: MarketListFilterTimeframe;
  starredMarketCoins?: string[];
};

type PaginationState = {
  page: number;
  search: string;
  category: MarketListCategory;
  favoriteIdsKey: string;
  sorting: MarketListSorting;
  timeframe: MarketListFilterTimeframe;
};

export interface MarketAssetsResult {
  assets: MarketAssetDisplayData[];
  loading: boolean;
  isError: boolean;
  emptyState: "favorites" | undefined;
  onEndReached: () => void;
}

export function useMarketAssets({
  search = "",
  category = "all",
  sorting = "marketCap",
  timeframe = "1D",
  starredMarketCoins = [],
}: MarketAssetsParams = {}): MarketAssetsResult {
  const { locale } = useLocale();
  const { t } = useTranslation();
  const counterValueCurrency = useSelector(counterValueCurrencySelector);
  const counterCurrency = counterValueCurrency.ticker.toLowerCase();
  const counterValueUnit = counterValueCurrency.units[0];
  const normalizedSearch = search.trim();
  const hasSearch = normalizedSearch.length > 0;
  const isFavoritesCategory = !hasSearch && category === "starred";
  const sortedFavoriteIds = useMemo(
    () =>
      isFavoritesCategory
        ? [...starredMarketCoins].sort((firstId, secondId) => firstId.localeCompare(secondId))
        : undefined,
    [isFavoritesCategory, starredMarketCoins],
  );
  const favoriteIdsKey = sortedFavoriteIds?.join(",") ?? "";
  const hasFavoriteIds = Boolean(sortedFavoriteIds?.length);
  const shouldFetchAssets = !isFavoritesCategory || hasFavoriteIds;
  const [pagination, setPagination] = useState<PaginationState>(() => ({
    page: 1,
    search: normalizedSearch,
    category,
    favoriteIdsKey,
    sorting,
    timeframe,
  }));
  const isPaginationSynced =
    pagination.search === normalizedSearch &&
    pagination.category === category &&
    pagination.favoriteIdsKey === favoriteIdsKey &&
    pagination.sorting === sorting &&
    pagination.timeframe === timeframe;
  const page = isPaginationSynced ? pagination.page : 1;
  const requestedPage = shouldFetchAssets ? page : 0;
  const requestRange = getMarketListRequestRange(timeframe);
  const displayRange = getMarketListDisplayRange(timeframe);
  const order = getMarketListOrder(sorting);

  useEffect(() => {
    if (!isPaginationSynced) {
      setPagination({
        page: 1,
        search: normalizedSearch,
        category,
        favoriteIdsKey,
        sorting,
        timeframe,
      });
    }
  }, [category, favoriteIdsKey, isPaginationSynced, normalizedSearch, sorting, timeframe]);

  const result = useMarketData({
    counterCurrency,
    range: requestRange,
    order,
    limit: PAGE_SIZE,
    liveCompatible: true,
    page: requestedPage,
    search: normalizedSearch,
    starred: sortedFavoriteIds,
  });
  const marketData = shouldFetchAssets ? result.data : EMPTY_MARKET_DATA;

  const assets = useMemo(() => {
    const uniqueById = [...new Map(marketData.map(item => [item.id, item])).values()];
    return uniqueById.map(item =>
      mapMarketCurrencyToDisplayData(item, {
        counterCurrency,
        counterValueUnit,
        range: displayRange,
        locale,
        t,
      }),
    );
  }, [marketData, counterCurrency, counterValueUnit, displayRange, locale, t]);

  const hasData = assets.length > 0;
  const canLoadMore = shouldFetchAssets && marketData.length >= page * PAGE_SIZE;
  const loading = shouldFetchAssets && (result.isLoading || result.isPending) && !hasData;
  const isFetchingNextPage = shouldFetchAssets && page > 1 && result.isFetching && hasData;

  const onEndReached = useCallback(() => {
    if (!shouldFetchAssets || !canLoadMore || loading || isFetchingNextPage || result.isError) {
      return;
    }

    setPagination(current => {
      if (
        current.search !== normalizedSearch ||
        current.category !== category ||
        current.favoriteIdsKey !== favoriteIdsKey ||
        current.sorting !== sorting ||
        current.timeframe !== timeframe
      ) {
        return {
          page: 1,
          search: normalizedSearch,
          category,
          favoriteIdsKey,
          sorting,
          timeframe,
        };
      }

      return { ...current, page: current.page + 1 };
    });
  }, [
    canLoadMore,
    category,
    favoriteIdsKey,
    isFetchingNextPage,
    loading,
    normalizedSearch,
    result.isError,
    shouldFetchAssets,
    sorting,
    timeframe,
  ]);

  return {
    assets,
    loading,
    isError: shouldFetchAssets && result.isError,
    emptyState: isFavoritesCategory && !hasFavoriteIds ? "favorites" : undefined,
    onEndReached,
  };
}
