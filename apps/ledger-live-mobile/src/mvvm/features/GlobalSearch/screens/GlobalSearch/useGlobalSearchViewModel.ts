import { useCallback, useEffect, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import { track } from "~/analytics";
import type { MarketAssetDisplayData } from "LLM/components/AssetListItem";
import { useGlobalSearchDefaults } from "./useGlobalSearchDefaults";
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

const EMPTY_RESULTS: MarketAssetDisplayData[] = [];

export function useGlobalSearchViewModel(): GlobalSearchViewModel {
  const navigation = useNavigation();
  const [search, setSearch] = useState("");
  const isSearchActive = search.length > 0;

  const { defaultSections, isLoadingDefaults } = useGlobalSearchDefaults(!isSearchActive);

  useEffect(() => {
    track("search_open");
  }, []);

  const clearSearch = useCallback(() => setSearch(""), []);
  const onBack = useCallback(() => navigation.goBack(), [navigation]);

  return {
    search,
    setSearch,
    clearSearch,
    isSearchActive,
    isLoadingDefaults,
    isLoadingSearch: false,
    hasNoResults: false,
    defaultSections,
    searchResults: EMPTY_RESULTS,
    onBack,
  };
}
