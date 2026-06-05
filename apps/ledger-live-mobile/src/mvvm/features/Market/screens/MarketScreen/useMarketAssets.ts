import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useMarketData } from "@ledgerhq/live-common/market/hooks/useMarketDataProvider";
import type { MarketCurrencyData } from "@ledgerhq/live-common/market/utils/types";
import type { Unit } from "@ledgerhq/types-cryptoassets";
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
const STOCK_MARKET_FILTER = "stock";
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

type PaginationParams = Omit<PaginationState, "page">;

type CategoryState = {
  isFavoritesCategory: boolean;
  isStocksCategory: boolean;
  sortedFavoriteIds: string[] | undefined;
  favoriteIdsKey: string;
  hasFavoriteIds: boolean;
  shouldFetchAssets: boolean;
};

type EmptyState = "favorites" | "stocks" | undefined;

export interface MarketAssetsResult {
  assets: MarketAssetDisplayData[];
  loading: boolean;
  isError: boolean;
  emptyState: EmptyState;
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
  const {
    isFavoritesCategory,
    isStocksCategory,
    sortedFavoriteIds,
    favoriteIdsKey,
    hasFavoriteIds,
    shouldFetchAssets,
  } = useMarketCategoryState({ category, normalizedSearch, starredMarketCoins });
  const paginationParams = useMemo<PaginationParams>(
    () => ({
      search: normalizedSearch,
      category,
      favoriteIdsKey,
      sorting,
      timeframe,
    }),
    [category, favoriteIdsKey, normalizedSearch, sorting, timeframe],
  );
  const { page, requestedPage, setPagination } = useMarketAssetPagination({
    params: paginationParams,
    shouldFetchAssets,
  });
  const requestRange = getMarketListRequestRange(timeframe);
  const displayRange = getMarketListDisplayRange(timeframe);
  const order = getMarketListOrder(sorting);

  const result = useMarketData({
    counterCurrency,
    range: requestRange,
    order,
    limit: PAGE_SIZE,
    liveCompatible: true,
    page: requestedPage,
    search: normalizedSearch,
    filter: getMarketFilter(isStocksCategory),
    starred: sortedFavoriteIds,
  });
  const marketData = getMarketDataForDisplay(result.data, shouldFetchAssets);

  const assets = useMemo(
    () =>
      getMarketAssets({
        marketData,
        isStocksCategory,
        counterCurrency,
        counterValueUnit,
        displayRange,
        locale,
        t,
      }),
    [counterCurrency, counterValueUnit, displayRange, isStocksCategory, locale, marketData, t],
  );

  const hasData = assets.length > 0;
  const canLoadMore = shouldFetchAssets && marketData.length >= page * PAGE_SIZE;
  const loading = shouldFetchAssets && (result.isLoading || result.isPending) && !hasData;
  const isFetchingNextPage = shouldFetchAssets && page > 1 && result.isFetching && hasData;

  const onEndReached = useCallback(() => {
    if (
      !canReachEnd({
        shouldFetchAssets,
        canLoadMore,
        loading,
        isFetchingNextPage,
        isError: result.isError,
      })
    ) {
      return;
    }

    setPagination(current => getNextPaginationState(current, paginationParams));
  }, [
    canLoadMore,
    isFetchingNextPage,
    loading,
    paginationParams,
    result.isError,
    setPagination,
    shouldFetchAssets,
  ]);

  return {
    assets,
    loading,
    isError: shouldFetchAssets && result.isError,
    emptyState: getEmptyState({ isFavoritesCategory, hasFavoriteIds, isStocksCategory }),
    onEndReached,
  };
}

function useMarketCategoryState({
  category,
  normalizedSearch,
  starredMarketCoins,
}: {
  category: MarketListCategory;
  normalizedSearch: string;
  starredMarketCoins: string[];
}): CategoryState {
  const hasSearch = normalizedSearch.length > 0;
  const isFavoritesCategory = !hasSearch && category === "starred";
  const isStocksCategory = !hasSearch && category === "stocks";
  const sortedFavoriteIds = useMemo(
    () => getSortedFavoriteIds(isFavoritesCategory, starredMarketCoins),
    [isFavoritesCategory, starredMarketCoins],
  );
  const favoriteIdsKey = sortedFavoriteIds?.join(",") ?? "";
  const hasFavoriteIds = Boolean(sortedFavoriteIds?.length);
  const shouldFetchAssets = !isFavoritesCategory || hasFavoriteIds;

  return {
    isFavoritesCategory,
    isStocksCategory,
    sortedFavoriteIds,
    favoriteIdsKey,
    hasFavoriteIds,
    shouldFetchAssets,
  };
}

function useMarketAssetPagination({
  params,
  shouldFetchAssets,
}: {
  params: PaginationParams;
  shouldFetchAssets: boolean;
}): {
  page: number;
  requestedPage: number;
  setPagination: Dispatch<SetStateAction<PaginationState>>;
} {
  const [pagination, setPagination] = useState<PaginationState>(() =>
    createPaginationState(params),
  );
  const isPaginationSynced = isSamePaginationTarget(pagination, params);
  const page = isPaginationSynced ? pagination.page : 1;
  const requestedPage = shouldFetchAssets ? page : 0;

  useEffect(() => {
    if (!isPaginationSynced) {
      setPagination(createPaginationState(params));
    }
  }, [isPaginationSynced, params]);

  return { page, requestedPage, setPagination };
}

function createPaginationState(params: PaginationParams): PaginationState {
  return {
    page: 1,
    ...params,
  };
}

function getNextPaginationState(
  current: PaginationState,
  params: PaginationParams,
): PaginationState {
  if (!isSamePaginationTarget(current, params)) {
    return createPaginationState(params);
  }

  return { ...current, page: current.page + 1 };
}

function isSamePaginationTarget(state: PaginationState, params: PaginationParams): boolean {
  return (
    state.search === params.search &&
    state.category === params.category &&
    state.favoriteIdsKey === params.favoriteIdsKey &&
    state.sorting === params.sorting &&
    state.timeframe === params.timeframe
  );
}

function getSortedFavoriteIds(
  isFavoritesCategory: boolean,
  starredMarketCoins: string[],
): string[] | undefined {
  if (!isFavoritesCategory) {
    return undefined;
  }

  return [...starredMarketCoins].sort((firstId, secondId) => firstId.localeCompare(secondId));
}

function getMarketFilter(isStocksCategory: boolean): string | undefined {
  return isStocksCategory ? STOCK_MARKET_FILTER : undefined;
}

function getMarketDataForDisplay(
  data: MarketCurrencyData[],
  shouldFetchAssets: boolean,
): MarketCurrencyData[] {
  return shouldFetchAssets ? data : EMPTY_MARKET_DATA;
}

function getMarketAssets({
  marketData,
  isStocksCategory,
  counterCurrency,
  counterValueUnit,
  displayRange,
  locale,
  t,
}: {
  marketData: MarketCurrencyData[];
  isStocksCategory: boolean;
  counterCurrency: string;
  counterValueUnit: Unit;
  displayRange: Parameters<typeof mapMarketCurrencyToDisplayData>[1]["range"];
  locale: string;
  t: Parameters<typeof mapMarketCurrencyToDisplayData>[1]["t"];
}): MarketAssetDisplayData[] {
  const filteredMarketData = isStocksCategory
    ? marketData.filter(isStockMarketCurrency)
    : marketData;
  const uniqueById = [...new Map(filteredMarketData.map(item => [item.id, item])).values()];

  return uniqueById.map(item =>
    mapMarketCurrencyToDisplayData(item, {
      counterCurrency,
      counterValueUnit,
      range: displayRange,
      locale,
      t,
    }),
  );
}

function canReachEnd({
  shouldFetchAssets,
  canLoadMore,
  loading,
  isFetchingNextPage,
  isError,
}: {
  shouldFetchAssets: boolean;
  canLoadMore: boolean;
  loading: boolean;
  isFetchingNextPage: boolean;
  isError: boolean;
}): boolean {
  return shouldFetchAssets && canLoadMore && !loading && !isFetchingNextPage && !isError;
}

function getEmptyState({
  isFavoritesCategory,
  hasFavoriteIds,
  isStocksCategory,
}: {
  isFavoritesCategory: boolean;
  hasFavoriteIds: boolean;
  isStocksCategory: boolean;
}): EmptyState {
  if (isFavoritesCategory && !hasFavoriteIds) {
    return "favorites";
  }

  if (isStocksCategory) {
    return "stocks";
  }

  return undefined;
}

function isStockMarketCurrency(item: MarketCurrencyData): boolean {
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
