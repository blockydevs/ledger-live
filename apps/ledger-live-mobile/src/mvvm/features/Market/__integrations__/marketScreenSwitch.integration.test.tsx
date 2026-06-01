import * as React from "react";
import { renderWithReactQuery, screen, waitFor, withFlagOverrides } from "@tests/test-renderer";
import { server, http, HttpResponse } from "@tests/server";
import { MOCK_MARKET_PERFORMERS } from "@ledgerhq/live-common/market/utils/fixtures";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { BaseNavigatorStackParamList } from "~/components/RootNavigator/types/BaseNavigator";
import { ScreenName } from "~/const";
import MarketNavigator from "../Navigator";
import { MARKET_SCREEN_TEST_IDS } from "../screens/MarketScreen/testIds";

const COUNTERVALUES_API = "https://countervalues.live.ledger.com";

const Stack = createNativeStackNavigator<BaseNavigatorStackParamList>();

const NavigatorWrapper = () => (
  <Stack.Navigator initialRouteName={ScreenName.MarketList}>
    {MarketNavigator({ Stack })}
  </Stack.Navigator>
);

const enableAssetDiscoverability = withFlagOverrides({
  lwmWallet40: { enabled: true, params: { assetDiscoverability: true } },
});

describe("Market screen navigator switch", () => {
  beforeEach(() => {
    server.use(
      http.get(`${COUNTERVALUES_API}/v3/markets`, () => HttpResponse.json(MOCK_MARKET_PERFORMERS)),
    );
  });

  it("should render MarketList when asset discoverability is off", async () => {
    renderWithReactQuery(<NavigatorWrapper />);

    await waitFor(() => {
      expect(screen.getByTestId("market-list")).toBeVisible();
    });
    expect(screen.queryByTestId(MARKET_SCREEN_TEST_IDS.screen)).toBeNull();
  });

  it("should render the new MarketScreen with its placeholder blocks when asset discoverability is on", async () => {
    renderWithReactQuery(<NavigatorWrapper />, {
      overrideInitialState: enableAssetDiscoverability,
    });

    await waitFor(() => {
      expect(screen.getByTestId(MARKET_SCREEN_TEST_IDS.screen)).toBeVisible();
    });
    expect(screen.getByTestId(MARKET_SCREEN_TEST_IDS.searchBar)).toBeVisible();
    expect(screen.getByTestId(MARKET_SCREEN_TEST_IDS.highlights)).toBeVisible();
    expect(screen.getByTestId(MARKET_SCREEN_TEST_IDS.list)).toBeVisible();
    expect(screen.getAllByTestId(MARKET_SCREEN_TEST_IDS.highlightCard).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("market-list")).toBeNull();
  });
});
