import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { HomeScreenConfigState, MarketBannerFilter, State } from "./types";

/**
 * V4 home screen config — user preferences for the home screen.
 * Persisted as a user preference (never reset).
 */
export const HOME_SCREEN_CONFIG_INITIAL_STATE: HomeScreenConfigState = {
  marketBannerFilter: "trending",
};

const homeScreenConfigSlice = createSlice({
  name: "homeScreenConfig",
  initialState: HOME_SCREEN_CONFIG_INITIAL_STATE,
  reducers: {
    setMarketBannerFilter: (state, action: PayloadAction<MarketBannerFilter>) => {
      state.marketBannerFilter = action.payload;
    },
    importHomeScreenConfig: (_state, action: PayloadAction<HomeScreenConfigState>) => ({
      ...HOME_SCREEN_CONFIG_INITIAL_STATE,
      ...action.payload,
    }),
  },
});

export const { setMarketBannerFilter, importHomeScreenConfig } = homeScreenConfigSlice.actions;

export const selectMarketBannerFilter = (state: State): MarketBannerFilter =>
  state.homeScreenConfig.marketBannerFilter;

export const exportHomeScreenConfigSelector = (state: State): HomeScreenConfigState =>
  state.homeScreenConfig;

export const homeScreenConfigReducer = homeScreenConfigSlice.reducer;
