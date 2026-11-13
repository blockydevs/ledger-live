import React from "react";
import { Text } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { getCryptoCurrencyById } from "@domain/entity-currency-crypto";
import type { Account } from "@ledgerhq/types-live";
import { genAccount } from "@ledgerhq/ledger-wallet-framework/mocks/account";
import { getXrpEnabledTokenStandards } from "@ledgerhq/live-common/families/xrp/config";
import { render, screen, withFlagOverrides } from "@tests/test-renderer";
import type { BaseNavigatorStackParamList } from "~/components/RootNavigator/types/BaseNavigator";
import { BASE_NAVIGATOR_ID, ScreenName } from "~/const";
import type { State } from "~/reducers/types";
import AccountScreen from "../AccountScreen";
import { ACCOUNT_DETAIL_TEST_IDS } from "../testIds";

jest.mock("@ledgerhq/live-common/families/xrp/config", () => {
  return {
    ...jest.requireActual("@ledgerhq/live-common/families/xrp/config"),
    getXrpEnabledTokenStandards: jest.fn(),
  };
});

const xrpAccount = genAccount("account-detail-manage-assets-xrp", {
  currency: getCryptoCurrencyById("ripple"),
});
const btcAccount = genAccount("account-detail-manage-assets-btc", {
  currency: getCryptoCurrencyById("bitcoin"),
});
const MANAGE_ASSETS_ROW = "account-settings-manage-assets";

const Stack = createNativeStackNavigator<BaseNavigatorStackParamList, typeof BASE_NAVIGATOR_ID>();

function ManageAssetsStub({ route }: Readonly<{ route: { params: { accountId: string } } }>) {
  return <Text>{`Managing the assets of ${route.params.accountId}`}</Text>;
}

async function openSettings(account: Account) {
  const view = render(
    <Stack.Navigator id={BASE_NAVIGATOR_ID} screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name={ScreenName.Account}
        component={AccountScreen}
        initialParams={{ accountId: account.id }}
      />
      <Stack.Screen name={ScreenName.XrpManageAssets} component={ManageAssetsStub} />
    </Stack.Navigator>,
    {
      overrideInitialState: (state: State): State => {
        const withFlag = withFlagOverrides({ accountDetail: { enabled: true } })(state);
        return { ...withFlag, accounts: { ...withFlag.accounts, active: [account] } };
      },
    },
  );
  await view.user.press(await screen.findByTestId(ACCOUNT_DETAIL_TEST_IDS.settingsButton));
  return view;
}

describe("AccountDetail manage assets", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getXrpEnabledTokenStandards).mockReturnValue(["iou", "mpt"]);
  });

  it("opens the manage assets screen of an XRP account from the settings", async () => {
    const { user } = await openSettings(xrpAccount);

    await user.press(await screen.findByTestId(MANAGE_ASSETS_ROW));

    expect(await screen.findByText(`Managing the assets of ${xrpAccount.id}`)).toBeVisible();
  });

  it("has no manage assets setting for an account of a family without one", async () => {
    await openSettings(btcAccount);

    expect(await screen.findByTestId("account-settings-advanced-logs")).toBeVisible();
    expect(screen.queryByTestId(MANAGE_ASSETS_ROW)).toBeNull();
  });
});
