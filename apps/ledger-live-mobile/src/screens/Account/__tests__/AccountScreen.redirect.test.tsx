import React from "react";
import { Text } from "react-native";
import { useNavigationState } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { render, screen } from "@tests/test-renderer";
import type { BaseNavigatorStackParamList } from "~/components/RootNavigator/types/BaseNavigator";
import { NavigatorName, ScreenName } from "~/const";
import AccountScreen from "../index";
import { XRP_ACCOUNT, overrideWithAccounts } from "~/families/xrp/__mocks__/account.mock";

type TestParamList = Pick<BaseNavigatorStackParamList, ScreenName.Account> & {
  [NavigatorName.Base]: undefined;
  [NavigatorName.XrpRemoveTokenFlow]: undefined;
};

const Stack = createNativeStackNavigator<TestParamList>();

function PortfolioStub() {
  return <Text>Portfolio</Text>;
}

function FlowStub() {
  return <Text>Flow</Text>;
}

type AccountRouteProps = React.ComponentProps<typeof AccountScreen>;

function AccountScreenOrStub(props: AccountRouteProps) {
  const { accountId, parentId } = props.route.params ?? {};
  const stackSize = useNavigationState(state => state.routes.length);
  if (parentId) return <AccountScreen {...props} />;

  return <Text>{`Account ${accountId}, ${stackSize} on the stack`}</Text>;
}

const goneTokenRoute = {
  name: ScreenName.Account,
  params: { accountId: `${XRP_ACCOUNT.id}+gone-token`, parentId: XRP_ACCOUNT.id },
};

describe("Account screen of a token account that is gone", () => {
  it("goes to the portfolio when its parent account is gone too", async () => {
    render(
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name={ScreenName.Account} component={AccountScreen} />
        <Stack.Screen name={NavigatorName.Base} component={PortfolioStub} />
      </Stack.Navigator>,
      {
        navigationInitialState: { index: 0, routes: [goneTokenRoute] },
        overrideInitialState: overrideWithAccounts(),
      },
    );

    expect(await screen.findByText("Portfolio")).toBeVisible();
  });

  it("goes back to its parent account screen right below", async () => {
    render(
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name={ScreenName.Account} component={AccountScreenOrStub} />
      </Stack.Navigator>,
      {
        navigationInitialState: {
          index: 1,
          routes: [
            { name: ScreenName.Account, params: { accountId: XRP_ACCOUNT.id } },
            goneTokenRoute,
          ],
        },
        overrideInitialState: overrideWithAccounts(XRP_ACCOUNT),
      },
    );

    expect(await screen.findByText(`Account ${XRP_ACCOUNT.id}, 1 on the stack`)).toBeVisible();
  });

  it("puts its parent account screen in its place when nothing is below", async () => {
    render(
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name={ScreenName.Account} component={AccountScreenOrStub} />
      </Stack.Navigator>,
      {
        navigationInitialState: { index: 0, routes: [goneTokenRoute] },
        overrideInitialState: overrideWithAccounts(XRP_ACCOUNT),
      },
    );

    expect(await screen.findByText(`Account ${XRP_ACCOUNT.id}, 1 on the stack`)).toBeVisible();
  });

  it("waits under a flow on top, which leaving would close too", async () => {
    render(
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name={ScreenName.Account} component={AccountScreen} />
        <Stack.Screen name={NavigatorName.XrpRemoveTokenFlow} component={FlowStub} />
      </Stack.Navigator>,
      {
        navigationInitialState: {
          index: 1,
          routes: [goneTokenRoute, { name: NavigatorName.XrpRemoveTokenFlow }],
        },
        overrideInitialState: overrideWithAccounts(XRP_ACCOUNT),
      },
    );

    expect(await screen.findByText("Flow")).toBeVisible();
    expect(screen.queryByText("Portfolio")).toBeNull();
  });
});
