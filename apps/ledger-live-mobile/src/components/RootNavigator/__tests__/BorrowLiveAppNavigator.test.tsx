import React from "react";
import { Pressable, Text } from "react-native";
import { render, screen } from "@tests/test-renderer";
import { useWalletFeaturesConfig } from "@ledgerhq/live-common/featureFlags/index";
import type { BorrowSwapNavigationParams } from "@ledgerhq/live-common/wallet-api/Borrow/navigate";
import { NavigatorName, ScreenName } from "~/const";
import { getStackNavigatorConfig } from "~/navigation/navigatorConfig";
import BorrowLiveAppNavigator from "../BorrowLiveAppNavigator";

const baseNavigate = jest.fn();

jest.mock("@ledgerhq/live-common/featureFlags/index", () => ({
  ...jest.requireActual("@ledgerhq/live-common/featureFlags/index"),
  useWalletFeaturesConfig: jest.fn(),
}));

jest.mock("@react-navigation/native", () => {
  const actual = jest.requireActual("@react-navigation/native");
  return {
    ...actual,
    useNavigation: () => ({ navigate: baseNavigate }),
  };
});

jest.mock("LLM/features/Borrow", () => ({
  BorrowLiveAppWrapper: ({
    onWalletApiGoToSwap,
  }: {
    onWalletApiGoToSwap?: (params: BorrowSwapNavigationParams) => void;
  }) => (
    <>
      <Text testID="borrow-live-app-wrapper">Borrow Live App</Text>
      <Pressable
        testID="go-to-swap"
        onPress={() =>
          onWalletApiGoToSwap?.({
            fromCurrencyId: "ethereum",
            toCurrencyId: "bitcoin",
            amountFrom: "1",
            affiliate: "borrow-app",
          })
        }
      >
        <Text>Go to swap</Text>
      </Pressable>
    </>
  ),
}));

jest.mock("~/navigation/navigatorConfig", () => ({
  getStackNavigatorConfig: jest.fn(() => ({ headerShown: true })),
}));

const setWallet40Flag = (enabled: boolean) =>
  jest
    .mocked(useWalletFeaturesConfig)
    .mockReturnValue({ shouldDisplayWallet40MainNav: enabled } as ReturnType<
      typeof useWalletFeaturesConfig
    >);

const expectedSwapParams = {
  fromCurrencyId: "ethereum",
  toCurrencyId: "bitcoin",
  amountFrom: "1",
  affiliate: "borrow-app",
  fromPath: ScreenName.Borrow,
};

describe("BorrowLiveAppNavigator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setWallet40Flag(false);
  });

  it("renders the borrow live app wrapper screen", () => {
    render(<BorrowLiveAppNavigator />);

    expect(screen.getByTestId("borrow-live-app-wrapper")).toBeOnTheScreen();
    expect(jest.mocked(getStackNavigatorConfig)).toHaveBeenCalled();
  });

  it("routes go-to-swap to the top-level Swap navigator when shouldDisplayWallet40MainNav is false", async () => {
    setWallet40Flag(false);
    const { user } = render(<BorrowLiveAppNavigator />);

    await user.press(screen.getByTestId("go-to-swap"));

    expect(baseNavigate).toHaveBeenCalledWith(NavigatorName.Swap, {
      screen: ScreenName.SwapTab,
      params: expectedSwapParams,
    });
  });

  it("routes go-to-swap through the Main navigator when shouldDisplayWallet40MainNav is true", async () => {
    setWallet40Flag(true);
    const { user } = render(<BorrowLiveAppNavigator />);

    await user.press(screen.getByTestId("go-to-swap"));

    expect(baseNavigate).toHaveBeenCalledWith(NavigatorName.Main, {
      screen: NavigatorName.Swap,
      params: {
        screen: ScreenName.SwapTab,
        params: expectedSwapParams,
      },
    });
  });
});
