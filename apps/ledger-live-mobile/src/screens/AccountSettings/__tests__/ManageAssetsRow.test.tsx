import React from "react";
import { Text } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { getCryptoCurrencyById } from "@domain/entity-currency-crypto";
import type { Account } from "@ledgerhq/types-live";
import { genAccount } from "@ledgerhq/ledger-wallet-framework/mocks/account";
import { getXrpEnabledTokenStandards } from "@ledgerhq/live-common/families/xrp/config";
import { render, screen } from "@tests/test-renderer";
import { ScreenName } from "~/const";
import { XRP_ACCOUNT, overrideWithAccounts } from "~/families/xrp/__mocks__/account.mock";
import AccountSettings from "../index";

jest.mock("@ledgerhq/live-common/families/xrp/config", () => {
  return {
    ...jest.requireActual("@ledgerhq/live-common/families/xrp/config"),
    getXrpEnabledTokenStandards: jest.fn(),
  };
});

const BITCOIN_ACCOUNT = genAccount("bitcoin-1", { currency: getCryptoCurrencyById("bitcoin") });
const MANAGE_ASSETS_ROW = "account-manage-assets-row";

type TestParamList = {
  [ScreenName.AccountSettingsMain]: { accountId: string };
  [ScreenName.XrpManageAssets]: { accountId: string };
};

const Stack = createNativeStackNavigator<TestParamList>();

function ManageAssetsStub({ route }: Readonly<{ route: { params: { accountId: string } } }>) {
  return <Text>{`Managing the assets of ${route.params.accountId}`}</Text>;
}

function renderAccountSettings(account: Account) {
  return render(
    <Stack.Navigator>
      <Stack.Screen
        name={ScreenName.AccountSettingsMain}
        component={AccountSettings}
        initialParams={{ accountId: account.id }}
      />
      <Stack.Screen name={ScreenName.XrpManageAssets} component={ManageAssetsStub} />
    </Stack.Navigator>,
    { overrideInitialState: overrideWithAccounts(account) },
  );
}

describe("Account settings manage assets row", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getXrpEnabledTokenStandards).mockReturnValue(["iou", "mpt"]);
  });

  it("opens the manage assets screen of an XRP account", async () => {
    const { user } = renderAccountSettings(XRP_ACCOUNT);

    await user.press(await screen.findByTestId(MANAGE_ASSETS_ROW));

    expect(await screen.findByText(`Managing the assets of ${XRP_ACCOUNT.id}`)).toBeVisible();
  });

  it("is hidden for an XRP account when every token standard is off", async () => {
    jest.mocked(getXrpEnabledTokenStandards).mockReturnValue([]);
    renderAccountSettings(XRP_ACCOUNT);

    expect(await screen.findByTestId("account-advanced-log-row")).toBeVisible();
    expect(screen.queryByTestId(MANAGE_ASSETS_ROW)).toBeNull();
  });

  it("is hidden for an account of a family without assets to manage", async () => {
    renderAccountSettings(BITCOIN_ACCOUNT);

    expect(await screen.findByTestId("account-advanced-log-row")).toBeVisible();
    expect(screen.queryByTestId(MANAGE_ASSETS_ROW)).toBeNull();
  });
});
