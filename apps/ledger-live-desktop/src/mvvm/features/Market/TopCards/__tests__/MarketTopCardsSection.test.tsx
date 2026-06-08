import React from "react";
import { render, screen, withFlagOverrides } from "tests/testSetup";
import MarketTopCards from "../index";

const assetDiscoverabilityOn = withFlagOverrides({
  lwdWallet40: { enabled: true, params: { assetDiscoverability: true } },
});

const assetDiscoverabilityOff = withFlagOverrides({
  lwdWallet40: { enabled: false },
});

describe("MarketTopCards", () => {
  it("renders the section with the side placeholders and the mood index card when assetDiscoverability is on", async () => {
    render(<MarketTopCards />, { initialState: assetDiscoverabilityOn });

    expect(screen.getByRole("region", { name: /market top cards/i })).toBeVisible();
    expect(screen.getByTestId("market-top-card-1")).toBeVisible();
    expect(screen.getByTestId("market-top-card-3")).toBeVisible();

    expect(await screen.findByTestId("mood-index-card")).toBeVisible();
  });

  it("renders nothing when assetDiscoverability is off", () => {
    render(<MarketTopCards />, { initialState: assetDiscoverabilityOff });

    expect(screen.queryByRole("region", { name: /market top cards/i })).toBeNull();
  });
});
