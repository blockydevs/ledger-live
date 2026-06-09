import { MarketCurrencyData } from "@ledgerhq/live-common/market/utils/types";

export type SearchMode = "suggestions" | "results" | "noResults";

export type AssetSuggestionSection = {
  data: MarketCurrencyData[];
  isLoading: boolean;
};

export type SearchSuggestions = {
  cryptos: AssetSuggestionSection;
  stablecoins: AssetSuggestionSection;
  stocks: AssetSuggestionSection;
};

export type SearchResults = {
  data: MarketCurrencyData[];
  isLoading: boolean;
};

export type SearchOverlayContextValue = {
  close: () => void;
  navigateToAsset: (currencyId: string) => void;
  suggestions: SearchSuggestions;
  results: SearchResults;
  mode: SearchMode;
};
