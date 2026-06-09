import { act, renderHook } from "@tests/test-renderer";
import { track } from "~/analytics";
import type { State } from "~/reducers/types";
import { useMarketBannerFilter } from "../useMarketBannerFilter";

jest.mock("~/analytics", () => ({ track: jest.fn() }));

const withStarred = (starredMarketCoins: string[]) => (state: State) => ({
  ...state,
  settings: { ...state.settings, starredMarketCoins },
});

describe("useMarketBannerFilter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("defaults to the trending filter and a closed drawer", () => {
    const { result } = renderHook(() => useMarketBannerFilter());

    expect(result.current.filter).toBe("trending");
    expect(result.current.isOpen).toBe(false);
    expect(result.current.options.map(option => option.value)).toEqual([
      "trending",
      "gainers",
      "losers",
      "favorites",
    ]);
  });

  it("disables the favorites option with a description when no asset is starred", () => {
    const { result } = renderHook(() => useMarketBannerFilter(), {
      overrideInitialState: withStarred([]),
    });

    const favorites = result.current.options.find(option => option.value === "favorites");
    expect(favorites?.disabled).toBe(true);
    expect(favorites?.descriptionKey).toBe("marketBanner.filter.noFavorites");
  });

  it("enables the favorites option when at least one asset is starred", () => {
    const { result } = renderHook(() => useMarketBannerFilter(), {
      overrideInitialState: withStarred(["bitcoin"]),
    });

    const favorites = result.current.options.find(option => option.value === "favorites");
    expect(favorites?.disabled).toBe(false);
    expect(favorites?.descriptionKey).toBeUndefined();
  });

  it("opens and closes the selection drawer", () => {
    const { result } = renderHook(() => useMarketBannerFilter());

    act(() => result.current.onOpen());
    expect(result.current.isOpen).toBe(true);

    act(() => result.current.onClose());
    expect(result.current.isOpen).toBe(false);
  });

  it("persists the selected filter, tracks it and closes the drawer", () => {
    const { result, store } = renderHook(() => useMarketBannerFilter());

    act(() => result.current.onOpen());
    act(() => result.current.onSelect("gainers"));

    expect(store.getState().marketBanner.ranking).toBe("gainers");
    expect(result.current.isOpen).toBe(false);
    expect(track).toHaveBeenCalledWith("change_sort_market_banner", { sort: "gainers" });
  });

  it("does not track when selecting the already active filter", () => {
    const { result } = renderHook(() => useMarketBannerFilter());

    act(() => result.current.onSelect("trending"));

    expect(track).not.toHaveBeenCalledWith("change_sort_market_banner", expect.anything());
  });
});
