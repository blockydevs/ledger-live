import { useLayoutEffect } from "react";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { useWalletFeaturesConfig } from "@features/platform-feature-flags";
import type { MarketAssetDisplayData } from "LLM/components/AssetListItem";
import type { MarketNavigatorStackParamList } from "LLM/features/Market/Navigator";
import { parseMarketListCategory } from "LLM/features/Market/utils/marketListCategory";
import { useMarketAssetPress } from "./useMarketAssetPress";
import { useMarketAssets } from "./useMarketAssets";
import { type MarketCategories, useMarketCategories } from "./useMarketCategories";
import { useMarketHighlights, type MarketHighlights } from "./useMarketHighlights";
import { type MarketSearch, useMarketSearch } from "./useMarketSearch";
import { ScreenName } from "~/const";
import { useDispatch, useSelector } from "~/context/hooks";
import { selectMarketListCategory, setMarketListCategory } from "~/reducers/market";
import { starredMarketCoinsSelector } from "~/reducers/settings";

type MarketScreenRoute = RouteProp<MarketNavigatorStackParamList, ScreenName.MarketList>;

export type { MarketHighlightCard } from "./useMarketHighlights";

export type { MarketCategories, MarketCategoryTab } from "./useMarketCategories";

export type MarketScreenAssetsList = {
  assets: MarketAssetDisplayData[];
  assetsLoading: boolean;
  assetsLoadingMore: boolean;
  assetsError: boolean;
  assetsEmptyState: "favorites" | undefined;
  categories: MarketCategories;
  onAssetPress: (asset: MarketAssetDisplayData) => void;
  onEndReached: () => void;
};

export type MarketScreenViewModel = {
  search: Pick<MarketSearch, "value" | "onChangeText" | "onClear">;
  highlights: MarketHighlights;
  assetsList: MarketScreenAssetsList;
  isSearchActive: boolean;
};

export function useMarketScreenViewModel(): MarketScreenViewModel {
  const dispatch = useDispatch();
  const route = useRoute<MarketScreenRoute>();
  const persistedCategory = useSelector(selectMarketListCategory);
  const { shouldDisplayAssetDiscoverability } = useWalletFeaturesConfig("mobile");
  const routeCategory = parseMarketListCategory(route.params?.category);
  const search = useMarketSearch();
  const highlights = useMarketHighlights();
  const categories = useMarketCategories();
  const starredMarketCoins = useSelector(starredMarketCoinsSelector);
  const { assets, loading, loadingMore, isError, emptyState, onEndReached } = useMarketAssets({
    search: search.query,
    category: categories.selectedCategory,
    starredMarketCoins,
  });
  const onAssetPress = useMarketAssetPress();

  useLayoutEffect(() => {
    if (
      !shouldDisplayAssetDiscoverability ||
      !routeCategory ||
      routeCategory === persistedCategory
    ) {
      return;
    }

    dispatch(setMarketListCategory(routeCategory));
  }, [dispatch, persistedCategory, routeCategory, shouldDisplayAssetDiscoverability]);

  return {
    search: {
      value: search.value,
      onChangeText: search.onChangeText,
      onClear: search.onClear,
    },
    highlights,
    assetsList: {
      assets: search.isDebouncing ? [] : assets,
      assetsLoading: search.isDebouncing || loading,
      assetsLoadingMore: loadingMore,
      assetsError: isError,
      assetsEmptyState: search.isDebouncing ? undefined : emptyState,
      categories,
      onAssetPress,
      onEndReached,
    },
    isSearchActive: search.isActive,
  };
}
