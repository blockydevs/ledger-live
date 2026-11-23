import React from "react";
import { Text } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { genAccount } from "@ledgerhq/ledger-wallet-framework/mocks/account";
import { getXrpEnabledTokenStandards } from "@ledgerhq/live-common/families/xrp/config";
import type { Account } from "@ledgerhq/types-live";
import { getCryptoCurrencyById } from "@domain/entity-currency-crypto";
import { track } from "@shared/analytics";
import { render, screen, withFlagOverrides } from "@tests/test-renderer";
import type { BaseNavigatorStackParamList } from "~/components/RootNavigator/types/BaseNavigator";
import type { StackNavigatorProps } from "~/components/RootNavigator/types/helpers";
import { BASE_NAVIGATOR_ID, NavigatorName, ScreenName } from "~/const";
import type { State } from "~/reducers/types";
import {
  XRP_ACCOUNT,
  XRP_ACCOUNT_WITH_TOKEN,
  XRP_IOU_TOKEN_ACCOUNT,
} from "~/families/xrp/__mocks__/account.mock";
import AccountScreen from "../AccountScreen";
import { ACCOUNT_DETAIL_TEST_IDS } from "../testIds";

jest.mock("@ledgerhq/live-common/families/xrp/config", () => {
  return {
    ...jest.requireActual("@ledgerhq/live-common/families/xrp/config"),
    getXrpEnabledTokenStandards: jest.fn(),
  };
});

const mockedGetXrpEnabledTokenStandards = jest.mocked(getXrpEnabledTokenStandards);

const btcAccount = genAccount("account-detail-manage-assets-btc", {
  currency: getCryptoCurrencyById("bitcoin"),
});
const btcAccountWithXrpToken: Account = {
  ...btcAccount,
  subAccounts: [{ ...XRP_IOU_TOKEN_ACCOUNT, parentId: btcAccount.id }],
};

const Stack = createNativeStackNavigator<BaseNavigatorStackParamList, typeof BASE_NAVIGATOR_ID>();

function ManageTokenFlow(
  props: StackNavigatorProps<BaseNavigatorStackParamList, NavigatorName.XrpManageTokenFlow>,
) {
  return <Text testID="manage-token-flow">{JSON.stringify(props.route.params)}</Text>;
}

async function openSettings(account: Account, { readOnlyModeEnabled = false } = {}) {
  const view = render(
    <Stack.Navigator id={BASE_NAVIGATOR_ID} screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name={ScreenName.Account}
        component={AccountScreen}
        initialParams={{ accountId: account.id }}
      />
      <Stack.Screen name={NavigatorName.XrpManageTokenFlow} component={ManageTokenFlow} />
    </Stack.Navigator>,
    {
      overrideInitialState: (state: State): State => {
        const withFlag = withFlagOverrides({ accountDetail: { enabled: true } })(state);

        return {
          ...withFlag,
          accounts: { ...withFlag.accounts, active: [account] },
          settings: { ...withFlag.settings, readOnlyModeEnabled },
        };
      },
    },
  );

  const settingsButton = await screen.findByTestId(ACCOUNT_DETAIL_TEST_IDS.settingsButton);
  await view.user.press(settingsButton);
  expect(screen.getByTestId("account-settings-change-name")).toBeVisible();
  jest.mocked(track).mockClear();

  return view;
}

describe("AccountDetail settings: Manage assets", () => {
  beforeEach(() => {
    mockedGetXrpEnabledTokenStandards.mockReturnValue(["iou", "mpt"]);
  });

  it("opens Manage assets of an XRP account that holds tokens", async () => {
    const view = await openSettings(XRP_ACCOUNT_WITH_TOKEN);

    await view.user.press(screen.getByTestId("account-settings-manage-assets"));

    expect(JSON.parse(screen.getByTestId("manage-token-flow").props.children)).toEqual({
      screen: ScreenName.XrpManageTokenList,
      params: { accountId: XRP_ACCOUNT_WITH_TOKEN.id },
    });
  });

  it("tracks the Manage assets click on the settings page", async () => {
    const view = await openSettings(XRP_ACCOUNT_WITH_TOKEN);

    await view.user.press(screen.getByTestId("account-settings-manage-assets"));

    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("button_clicked", {
      network: XRP_ACCOUNT_WITH_TOKEN.currency.id,
      button: "manage assets",
      page: "Account Settings",
    });
  });

  it.each([
    ["an XRP account without tokens", XRP_ACCOUNT],
    ["a non-XRP account", btcAccountWithXrpToken],
  ])("hides Manage assets on %s", async (_, account) => {
    await openSettings(account);

    expect(screen.queryByTestId("account-settings-manage-assets")).toBeNull();
  });

  it("hides Manage assets when no XRP token standard is enabled", async () => {
    mockedGetXrpEnabledTokenStandards.mockReturnValue([]);

    await openSettings(XRP_ACCOUNT_WITH_TOKEN);

    expect(screen.queryByTestId("account-settings-manage-assets")).toBeNull();
  });

  it("hides Manage assets in read-only mode", async () => {
    await openSettings(XRP_ACCOUNT_WITH_TOKEN, { readOnlyModeEnabled: true });

    expect(screen.queryByTestId("account-settings-manage-assets")).toBeNull();
  });
});
