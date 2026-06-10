import { useCallback, useEffect, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import { track } from "~/analytics";
import type { MarketAssetDisplayData } from "LLM/components/AssetListItem";

export type GlobalSearchDefaultSections = {
  cryptos: MarketAssetDisplayData[];
  stablecoins: MarketAssetDisplayData[];
  stocks: MarketAssetDisplayData[];
};

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

const EMPTY_DEFAULT_SECTIONS: GlobalSearchDefaultSections = {
  cryptos: [],
  stablecoins: [],
  stocks: [],
};

const EMPTY_RESULTS: MarketAssetDisplayData[] = [];

export function useGlobalSearchViewModel(): GlobalSearchViewModel {
  const navigation = useNavigation();
  const [search, setSearch] = useState("");

  useEffect(() => {
    track("search_open");
  }, []);

  const clearSearch = useCallback(() => setSearch(""), []);
  const onBack = useCallback(() => navigation.goBack(), [navigation]);

  return {
    search,
    setSearch,
    clearSearch,
    isSearchActive: search.length > 0,
    isLoadingDefaults: false,
    isLoadingSearch: false,
    hasNoResults: false,
    defaultSections: EMPTY_DEFAULT_SECTIONS,
    searchResults: EMPTY_RESULTS,
    onBack,
  };
}
