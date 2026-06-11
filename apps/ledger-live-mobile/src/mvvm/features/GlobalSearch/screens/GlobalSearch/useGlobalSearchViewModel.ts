import { useCallback, useEffect } from "react";
import { useNavigation } from "@react-navigation/native";
import type { StockSuggestion } from "@ledgerhq/live-common/dada-client/utils/assetDiscovery";
import { track } from "~/analytics";
import { ScreenName } from "~/const";
import type { MarketAssetDisplayData } from "LLM/components/AssetListItem";
import { useGlobalSearchDefaults } from "./useGlobalSearchDefaults";
import { useGlobalSearchResults } from "./useGlobalSearchResults";
import type { GlobalSearchDefaultSections } from "./types";

export type GlobalSearchCategory = "crypto" | "stable" | "stocks";

export type GlobalSearchViewModel = {
  search: string;
  setSearch: (value: string) => void;
  clearSearch: () => void;
  isSearchActive: boolean;
  isLoadingDefaults: boolean;
  isLoadingSearch: boolean;
  hasNoResults: boolean;
  defaultSections: GlobalSearchDefaultSections;
  searchResults: MarketAssetDisplayData[];
  onBack: () => void;
  onSeeAll: (category: GlobalSearchCategory) => void;
  onAssetPress: (asset: MarketAssetDisplayData) => void;
  onStockPress: (stock: StockSuggestion) => void;
};

export function useGlobalSearchViewModel(): GlobalSearchViewModel {
  const navigation = useNavigation();

  const {
    search,
    setSearch,
    clearSearch,
    isSearchActive,
    searchResults,
    isLoadingSearch,
    hasNoResults,
  } = useGlobalSearchResults();
  const { defaultSections, isLoadingDefaults } = useGlobalSearchDefaults(!isSearchActive);

  useEffect(() => {
    track("search_open");
  }, []);

  const onBack = useCallback(() => navigation.goBack(), [navigation]);

  const onSeeAll = useCallback((category: GlobalSearchCategory) => {
    track("button_clicked", { button: "See all", page: ScreenName.GlobalSearch, category });
  }, []);

  // Destinations are wired in LIVE-30048.
  const onAssetPress = useCallback((_asset: MarketAssetDisplayData) => {}, []);
  const onStockPress = useCallback((_stock: StockSuggestion) => {}, []);

  return {
    search,
    setSearch,
    clearSearch,
    isSearchActive,
    isLoadingDefaults,
    isLoadingSearch,
    hasNoResults,
    defaultSections,
    searchResults,
    onBack,
    onSeeAll,
    onAssetPress,
    onStockPress,
  };
}
