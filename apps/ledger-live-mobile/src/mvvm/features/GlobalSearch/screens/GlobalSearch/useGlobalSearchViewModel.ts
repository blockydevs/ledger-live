import { useCallback, useEffect } from "react";
import { useNavigation } from "@react-navigation/native";
import { track } from "~/analytics";
import type { MarketAssetDisplayData } from "LLM/components/AssetListItem";
import { useGlobalSearchDefaults } from "./useGlobalSearchDefaults";
import { useGlobalSearchResults } from "./useGlobalSearchResults";
import type { GlobalSearchDefaultSections } from "./types";

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
  };
}
