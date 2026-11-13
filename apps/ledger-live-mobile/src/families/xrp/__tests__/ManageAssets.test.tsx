import React from "react";
import BigNumber from "bignumber.js";
import { Text } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { Account } from "@ledgerhq/types-live";
import { render, screen } from "@tests/test-renderer";
import type { BaseNavigatorStackParamList } from "~/components/RootNavigator/types/BaseNavigator";
import { NavigatorName, ScreenName } from "~/const";
import { component as ManageAssets } from "../ManageAssets";
import {
  XRP_ACCOUNT,
  XRP_ACCOUNT_WITH_TOKEN,
  XRP_IOU_TOKEN_ACCOUNT,
  makePendingOptOut,
  overrideWithAccounts,
} from "../__mocks__/account.mock";
import { xrpIouToken } from "../__mocks__/currency.mock";

type TestParamList = Pick<BaseNavigatorStackParamList, ScreenName.XrpManageAssets> & {
  [NavigatorName.XrpRemoveTokenFlow]: { params: { accountId: string; parentId: string } };
};

const Stack = createNativeStackNavigator<TestParamList>();
const DELETE_BUTTON = `xrp-manage-asset-delete-${xrpIouToken.id}`;

function RemoveFlowStub({
  route,
}: Readonly<{ route: { params: TestParamList[NavigatorName.XrpRemoveTokenFlow] } }>) {
  const { accountId, parentId } = route.params.params;

  return <Text>{`Removing ${accountId} of ${parentId}`}</Text>;
}

function renderManageAssets(account: Account) {
  return render(
    <Stack.Navigator>
      <Stack.Screen
        name={ScreenName.XrpManageAssets}
        component={ManageAssets}
        initialParams={{ accountId: account.id }}
      />
      <Stack.Screen name={NavigatorName.XrpRemoveTokenFlow} component={RemoveFlowStub} />
    </Stack.Navigator>,
    { overrideInitialState: overrideWithAccounts(account) },
  );
}

describe("XRP manage assets", () => {
  it("lists a held token with its settings", async () => {
    renderManageAssets(XRP_ACCOUNT_WITH_TOKEN);

    expect(await screen.findByText("RLUSD")).toBeVisible();
    expect(screen.getByText("Trust Line (IOU)")).toBeVisible();
    expect(screen.getByText("1,000 RLUSD")).toBeVisible();
    expect(screen.getByText("Off")).toBeVisible();
  });

  it("asks to confirm the removal of an empty token, then starts it", async () => {
    const empty = { ...XRP_IOU_TOKEN_ACCOUNT, balance: new BigNumber(0) };
    const { user } = renderManageAssets({ ...XRP_ACCOUNT, subAccounts: [empty] });

    await user.press(await screen.findByTestId(DELETE_BUTTON));
    expect(await screen.findByText("Are you sure you want to delete RLUSD?")).toBeVisible();
    await user.press(screen.getByText("Continue"));

    expect(
      await screen.findByText(`Removing ${XRP_IOU_TOKEN_ACCOUNT.id} of ${XRP_ACCOUNT.id}`),
    ).toBeVisible();
  });

  it("asks to empty a held balance instead of removing the token", async () => {
    const held = { ...XRP_IOU_TOKEN_ACCOUNT, balance: new BigNumber(25) };
    const { user } = renderManageAssets({ ...XRP_ACCOUNT, subAccounts: [held] });

    await user.press(await screen.findByTestId(DELETE_BUTTON));
    expect(await screen.findByText("Empty your RLUSD balance to remove it")).toBeVisible();
    await user.press(screen.getByText("Got it"));

    expect(screen.queryByText(/^Removing/)).toBeNull();
    expect(screen.getByTestId(DELETE_BUTTON)).toBeVisible();
  });

  it("disables the removal of a frozen token", async () => {
    const frozen = {
      ...XRP_IOU_TOKEN_ACCOUNT,
      xrpResources: { ...XRP_IOU_TOKEN_ACCOUNT.xrpResources, isLocked: true },
    };
    renderManageAssets({ ...XRP_ACCOUNT, subAccounts: [frozen] });

    expect(await screen.findByTestId(DELETE_BUTTON)).toBeDisabled();
  });

  it("leaves out a token whose removal is pending", async () => {
    renderManageAssets({
      ...XRP_ACCOUNT_WITH_TOKEN,
      pendingOperations: [makePendingOptOut(xrpIouToken)],
    });

    expect(await screen.findByText("This account has no tokens yet.")).toBeVisible();
    expect(screen.queryByTestId(DELETE_BUTTON)).toBeNull();
  });
});
