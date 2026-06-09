import {
  HOME_SCREEN_CONFIG_INITIAL_STATE,
  homeScreenConfigReducer,
  importHomeScreenConfig,
  selectMarketBannerFilter,
  setMarketBannerFilter,
} from "../homeScreenConfig";
import type { HomeScreenConfigState, State } from "../types";

const asState = (homeScreenConfig: HomeScreenConfigState = HOME_SCREEN_CONFIG_INITIAL_STATE) =>
  ({ homeScreenConfig }) as State;

describe("homeScreenConfig slice", () => {
  it("exposes the documented defaults through its selectors", () => {
    expect(selectMarketBannerFilter(asState())).toBe("trending");
  });

  it("updates the market banner filter through its action", () => {
    let state = homeScreenConfigReducer(undefined, setMarketBannerFilter("gainers"));
    expect(state.marketBannerFilter).toBe("gainers");

    state = homeScreenConfigReducer(state, setMarketBannerFilter("losers"));
    expect(state.marketBannerFilter).toBe("losers");

    state = homeScreenConfigReducer(state, setMarketBannerFilter("starred"));
    expect(state.marketBannerFilter).toBe("starred");
  });

  it("rehydrates a persisted payload on top of the defaults", () => {
    const state = homeScreenConfigReducer(
      undefined,
      importHomeScreenConfig({ marketBannerFilter: "starred" }),
    );
    expect(state).toEqual({ marketBannerFilter: "starred" });
  });
});
