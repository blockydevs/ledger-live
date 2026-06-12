import React from "react";
import { render, screen, fireEvent } from "@tests/test-renderer";
import { MarketBannerFilterTrigger } from "..";

describe("MarketBannerFilterTrigger", () => {
  it("renders the label and calls onPress when pressed", () => {
    const onPress = jest.fn();
    render(<MarketBannerFilterTrigger label="Trending" onPress={onPress} testID="trigger" />);

    expect(screen.getByText("Trending")).toBeVisible();

    fireEvent.press(screen.getByTestId("trigger"));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
