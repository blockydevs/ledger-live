import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@tests/test-renderer";
import type { MarketBannerRanking, State } from "~/reducers/types";
import { useMarketBannerData } from "../useMarketBannerData";

const withState =
  (ranking: MarketBannerRanking, starredMarketCoins: string[]) => (state: State) => ({
    ...state,
    marketBanner: { ...state.marketBanner, ranking },
    settings: { ...state.settings, starredMarketCoins },
  });

const innerWrapper = ({ children }: { children?: React.ReactNode }) =>
  React.createElement(QueryClientProvider, { client: new QueryClient() }, children);

describe("useMarketBannerData", () => {
  it("falls back to trending when favorites is active but no asset is starred", async () => {
    const { store } = renderHook(() => useMarketBannerData("favorites"), {
      overrideInitialState: withState("favorites", []),
      innerWrapper,
    });

    await waitFor(() => {
      expect(store.getState().marketBanner.ranking).toBe("trending");
    });
  });

  it("keeps the favorites ranking when at least one asset is starred", async () => {
    const { store } = renderHook(() => useMarketBannerData("favorites"), {
      overrideInitialState: withState("favorites", ["bitcoin"]),
      innerWrapper,
    });

    await waitFor(() => {
      expect(store.getState().marketBanner.ranking).toBe("favorites");
    });
  });
});
