import { renderHook, act } from "tests/testSetup";
import { MarketCurrencyData } from "@ledgerhq/live-common/market/utils/types";
import { track } from "~/renderer/analytics/segment";
import { useSearchOverlayViewModel } from "../useSearchOverlayViewModel";
import { useAssetSearchBar } from "../useAssetSearchBar";
import { SearchMode, SearchResults, SearchSuggestions } from "../types";

jest.mock("../useAssetSearchBar");

// getCurrentTrackingPage/getPreviousTrackingPage read module-level navigation refs that leak
// across the full suite. Mock them so the tracked page/source are deterministic here.
jest.mock("~/renderer/analytics/screenRefs", () => ({
  getCurrentTrackingPage: () => "",
  getPreviousTrackingPage: () => "",
}));

const mockedUseAssetSearchBar = jest.mocked(useAssetSearchBar);
const mockedTrack = jest.mocked(track);

const EMPTY_SECTION = { data: [], isLoading: false };
const EMPTY_SUGGESTIONS: SearchSuggestions = {
  cryptos: EMPTY_SECTION,
  stocks: EMPTY_SECTION,
};
const EMPTY_RESULTS: SearchResults = {
  data: [],
  isLoading: false,
  hasNextPage: false,
  isFetchingNextPage: false,
};

function mockSearchBar({
  mode,
  isOpen,
  query = "",
}: {
  mode: SearchMode;
  isOpen: boolean;
  query?: string;
}) {
  mockedUseAssetSearchBar.mockReturnValue({
    query,
    onChangeQuery: jest.fn(),
    clear: jest.fn(),
    isOpen,
    open: jest.fn(),
    close: jest.fn(),
    mode,
    suggestions: EMPTY_SUGGESTIONS,
    results: EMPTY_RESULTS,
  });
}

describe("useSearchOverlayViewModel", () => {
  afterEach(() => jest.clearAllMocks());

  describe("displayed mode while closing", () => {
    it("exposes the live mode while the overlay is open", () => {
      mockSearchBar({ mode: "results", isOpen: true, query: "bit" });

      const { result } = renderHook(() => useSearchOverlayViewModel());

      expect(result.current.mode).toBe("results");
      expect(result.current.contextValue.mode).toBe("results");
    });

    it("keeps the last open mode while closing so the default list never flashes", () => {
      mockSearchBar({ mode: "results", isOpen: true, query: "bit" });
      const { result, rerender } = renderHook(() => useSearchOverlayViewModel());
      expect(result.current.mode).toBe("results");

      // close() clears the query, so the underlying mode flips to "suggestions" while the popover
      // is still animating closed. The view model must keep showing "results" (LIVE-32396).
      mockSearchBar({ mode: "suggestions", isOpen: false, query: "" });
      rerender();

      expect(result.current.mode).toBe("results");
      expect(result.current.contextValue.mode).toBe("results");
    });

    it("shows the suggestions again once the overlay reopens with an empty query", () => {
      mockSearchBar({ mode: "results", isOpen: true, query: "bit" });
      const { result, rerender } = renderHook(() => useSearchOverlayViewModel());

      mockSearchBar({ mode: "suggestions", isOpen: false, query: "" });
      rerender();
      expect(result.current.mode).toBe("results");

      mockSearchBar({ mode: "suggestions", isOpen: true, query: "" });
      rerender();
      expect(result.current.mode).toBe("suggestions");
    });
  });

  describe("navigateToAsset tracking", () => {
    it("tracks asset_clicked with searched=true when clicking a search result", () => {
      mockSearchBar({ mode: "results", isOpen: true, query: "bit" });
      const { result } = renderHook(() => useSearchOverlayViewModel());

      act(() => {
        result.current.contextValue.navigateToAsset("bitcoin", {
          name: "Bitcoin",
        } as MarketCurrencyData);
      });

      expect(mockedTrack).toHaveBeenCalledWith("asset_clicked", {
        asset: "Bitcoin",
        page: "",
        flow: "global_search",
        source: "",
        searched: true,
      });
    });

    it("tracks asset_clicked with searched=false when clicking the default suggestions list", () => {
      mockSearchBar({ mode: "suggestions", isOpen: true, query: "" });
      const { result } = renderHook(() => useSearchOverlayViewModel());

      act(() => {
        result.current.contextValue.navigateToAsset("bitcoin", {
          name: "Bitcoin",
        } as MarketCurrencyData);
      });

      expect(mockedTrack).toHaveBeenCalledWith(
        "asset_clicked",
        expect.objectContaining({ asset: "Bitcoin", flow: "global_search", searched: false }),
      );
    });

    it("falls back to the currency id when no market state is provided", () => {
      mockSearchBar({ mode: "suggestions", isOpen: true, query: "" });
      const { result } = renderHook(() => useSearchOverlayViewModel());

      act(() => {
        result.current.contextValue.navigateToAsset("aaplx");
      });

      expect(mockedTrack).toHaveBeenCalledWith(
        "asset_clicked",
        expect.objectContaining({ asset: "aaplx", searched: false }),
      );
    });
  });
});
