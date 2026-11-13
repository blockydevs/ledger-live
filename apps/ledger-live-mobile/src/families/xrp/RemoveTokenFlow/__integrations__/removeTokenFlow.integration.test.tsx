import React from "react";
import { Text } from "react-native";
import BigNumber from "bignumber.js";
import { Observable } from "rxjs";
import type { InitialState } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { Account, SignOperationEvent } from "@ledgerhq/types-live";
import type { XrpTokenAccount } from "@ledgerhq/live-common/families/xrp/types";
import { getXrpEnabledTokenStandards } from "@ledgerhq/live-common/families/xrp/config";
import { genTokenAccount } from "@ledgerhq/ledger-wallet-framework/mocks/account";
import { render, screen, waitFor } from "@tests/test-renderer";
import { NavigatorName, ScreenName } from "~/const";
import { component } from "../index";
import { XRP_ACCOUNT, overrideWithAccounts } from "../../__mocks__/account.mock";
import { xrpIouToken, xrpMptToken } from "../../__mocks__/currency.mock";
import { makeMockAccountBridge } from "../../__mocks__/bridge.mock";

jest.mock(
  "@ledgerhq/live-common/hw/actions/app",
  () => require("../../__mocks__/deviceConnection.mock").hwActionsAppModule,
);

jest.mock(
  "@ledgerhq/live-common/hw/index",
  () => require("../../__mocks__/deviceConnection.mock").hwIndexModule,
);

jest.mock(
  "~/hooks/useIsDeviceLockedPolling/useIsDeviceLockedPolling",
  () => require("../../__mocks__/deviceConnection.mock").deviceLockedPollingModule,
);

jest.mock("~/datadog", () => {
  return {
    isDatadogEnabled: false,
    initializeDatadogProvider: jest.fn(),
    customErrorEventMapper: jest.fn(),
    customActionEventMapper: jest.fn(),
    customLogEventMapper: jest.fn(),
    viewNamePredicate: jest.fn(),
    broadcastLogger: jest.fn(),
  };
});

jest.mock("@ledgerhq/live-common/families/xrp/config", () => {
  return {
    ...jest.requireActual("@ledgerhq/live-common/families/xrp/config"),
    getXrpEnabledTokenStandards: jest.fn(),
  };
});

const mockAccountBridge = makeMockAccountBridge();

jest.mock("@ledgerhq/live-common/bridge/index", () => {
  const {
    makeResolvedAccountBridge,
    resolvedCurrencyBridge,
  } = require("../../__mocks__/bridge.mock");
  return {
    __esModule: true,
    getAccountBridge: () => makeResolvedAccountBridge(mockAccountBridge),
    getCurrencyBridge: () => resolvedCurrencyBridge,
  };
});

const OuterStack = createNativeStackNavigator();
const InnerStack = createNativeStackNavigator();

const RESERVE_RELEASE = makeNamedError("XrpReserveRelease", { amount: "0.2 XRP" });

function makeNamedError(name: string, fields: Record<string, string> = {}) {
  return Object.assign(new Error(name), { name, ...fields });
}

function makeTokenAccount(token: typeof xrpIouToken, balance: number): XrpTokenAccount {
  return {
    ...genTokenAccount(0, XRP_ACCOUNT, token),
    id: `${XRP_ACCOUNT.id}+${token.id}`,
    balance: new BigNumber(balance),
    spendableBalance: new BigNumber(balance),
    xrpResources: { isLocked: false },
  };
}

function mockStatus(errors: Record<string, Error>, warnings: Record<string, Error> = {}) {
  mockAccountBridge.getTransactionStatus.mockResolvedValue({
    errors,
    warnings,
    estimatedFees: new BigNumber(12),
    amount: new BigNumber(0),
    totalSpent: new BigNumber(12),
  });
}

function SendFundsStub({ route }: { route: { params?: object } }) {
  return <Text testID="send-funds-params">{JSON.stringify(route.params)}</Text>;
}

function AccountStub({ route }: { route: { params?: { accountId?: string } } }) {
  return <Text testID={`account-screen-${route.params?.accountId}`}>Account</Text>;
}

function AccountsNavigatorStub() {
  return (
    <InnerStack.Navigator screenOptions={{ headerShown: false }}>
      <InnerStack.Screen name={ScreenName.Account} component={AccountStub} />
    </InnerStack.Navigator>
  );
}

function RemoveTokenFlowHarness() {
  return (
    <OuterStack.Navigator screenOptions={{ headerShown: false }}>
      <OuterStack.Screen name={NavigatorName.XrpRemoveTokenFlow} component={component} />
      <OuterStack.Screen name={NavigatorName.SendFunds} component={SendFundsStub} />
      <OuterStack.Screen name={ScreenName.Account} component={AccountStub} />
      <OuterStack.Screen name={NavigatorName.Accounts} component={AccountsNavigatorStub} />
    </OuterStack.Navigator>
  );
}

function renderReview(tokenAccount: XrpTokenAccount) {
  const account: Account = { ...XRP_ACCOUNT, subAccounts: [tokenAccount] };
  const params = {
    accountId: tokenAccount.id,
    parentId: account.id,
    token: tokenAccount.token,
  };

  return render(<RemoveTokenFlowHarness />, {
    navigationInitialState: {
      index: 0,
      routes: [
        {
          name: NavigatorName.XrpRemoveTokenFlow,
          state: { index: 0, routes: [{ name: ScreenName.XrpRemoveTokenReview, params }] },
        },
      ],
    },
    overrideInitialState: overrideWithAccounts(account),
  });
}

type Route = InitialState["routes"][number];

const TOKEN_ACCOUNT = makeTokenAccount(xrpIouToken, 0);
const PARENT_ACCOUNT_ROUTE = { name: ScreenName.Account, params: { accountId: XRP_ACCOUNT.id } };
const TOKEN_ACCOUNT_ROUTE = {
  name: ScreenName.Account,
  params: { accountId: TOKEN_ACCOUNT.id, parentId: XRP_ACCOUNT.id },
};

function renderSuccessAbove(routesBelow: Route[]) {
  const successParams = {
    accountId: XRP_ACCOUNT.id,
    tokenAccountId: TOKEN_ACCOUNT.id,
    token: xrpIouToken,
    deviceId: "mock",
    transaction: {},
    status: { errors: {}, warnings: {} },
    result: { id: "op-1" },
  };
  const flowRoute = {
    name: NavigatorName.XrpRemoveTokenFlow,
    state: {
      index: 0,
      routes: [{ name: ScreenName.XrpRemoveTokenValidationSuccess, params: successParams }],
    },
  };
  const routes = [...routesBelow, flowRoute];

  return render(<RemoveTokenFlowHarness />, {
    navigationInitialState: { index: routes.length - 1, routes },
    overrideInitialState: overrideWithAccounts({ ...XRP_ACCOUNT, subAccounts: [TOKEN_ACCOUNT] }),
  });
}

function getContinueButton() {
  return screen.getByTestId("xrp-remove-continue");
}

type UserEvents = ReturnType<typeof render>["user"];

async function signFromReview(user: UserEvents) {
  await waitFor(() => expect(getContinueButton()).toBeEnabled());
  await user.press(getContinueButton());
  await user.press(await screen.findByTestId("device-item-mock", {}, { timeout: 10000 }));
}

function getSignedTransaction() {
  const calls = mockAccountBridge.signOperation.mock.calls as unknown as [
    { transaction: Record<string, unknown> },
  ][];

  return calls[0][0].transaction;
}

describe("XRP RemoveTokenFlow (integration)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getXrpEnabledTokenStandards).mockReturnValue(["iou", "mpt"]);
    mockStatus({}, { reserve: RESERVE_RELEASE });
  });

  it("reviews an empty IOU, signs its opt-out and shows the released reserve", async () => {
    const { user } = renderReview(makeTokenAccount(xrpIouToken, 0));

    expect(await screen.findByText(`${xrpIouToken.name} (${xrpIouToken.ticker})`)).toBeVisible();
    expect(screen.getByText(xrpIouToken.contractAddress)).toBeVisible();
    expect(await screen.findByText("Unlocked amount")).toBeVisible();
    expect(screen.getByText("0.2 XRP")).toBeVisible();
    expect(screen.getByTestId("xrp-remove-device-limit")).toBeVisible();
    await signFromReview(user);

    expect(
      await screen.findByText(`${xrpIouToken.name} removed`, {}, { timeout: 15000 }),
    ).toBeVisible();
    expect(
      screen.getByText("0.2 XRP will be available again once the removal is confirmed."),
    ).toBeVisible();
    expect(getSignedTransaction()).toMatchObject({
      mode: "optOut",
      amount: new BigNumber(0),
      assetReference: xrpIouToken.tokenIdentifier,
      assetOwner: xrpIouToken.contractAddress,
    });
  });

  it("says the token leaves after the next sync when no reserve is released", async () => {
    mockStatus({});
    const { user } = renderReview(makeTokenAccount(xrpMptToken, 0));

    await signFromReview(user);

    expect(
      await screen.findByText(`${xrpMptToken.name} removed`, {}, { timeout: 15000 }),
    ).toBeVisible();
    expect(screen.getByText("It leaves your account after the next sync.")).toBeVisible();
  });

  it("tells nothing about a trust limit for an MPT", async () => {
    renderReview(makeTokenAccount(xrpMptToken, 0));

    expect(await screen.findByText(`${xrpMptToken.name} (${xrpMptToken.ticker})`)).toBeVisible();
    expect(screen.queryByTestId("xrp-remove-device-limit")).toBeNull();
  });

  it("blocks the removal of a held balance and offers to send it", async () => {
    const tokenAccount = makeTokenAccount(xrpIouToken, 25);
    const { user } = renderReview(tokenAccount);

    expect(
      await screen.findByText(
        "You still hold 25 RLUSD. Send your balance before removing this token.",
      ),
    ).toBeVisible();
    expect(screen.queryByTestId("xrp-remove-continue")).toBeNull();

    await user.press(screen.getByTestId("xrp-remove-send"));

    const sendParams = JSON.parse(
      (await screen.findByTestId("send-funds-params")).props.children as string,
    );
    expect(sendParams).toEqual({
      screen: ScreenName.SendSelectRecipient,
      params: { accountId: tokenAccount.id, parentId: XRP_ACCOUNT.id },
    });
  });

  it("blocks the removal when coin-xrp sees a balance the account doesn't show yet", async () => {
    mockStatus({ amount: makeNamedError("XrpOptOutBalanceNotZero") });
    renderReview(makeTokenAccount(xrpIouToken, 0));

    expect(
      await screen.findByText(
        "You still hold this token. Send your balance before removing this token.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/You still hold 0/)).toBeNull();
    expect(screen.queryByTestId("xrp-remove-continue")).toBeNull();
  });

  it("blocks on a coin-xrp opt-out error and shows its string", async () => {
    mockStatus({ transaction: makeNamedError("XrpOptOutTokenInEscrow") });
    renderReview(makeTokenAccount(xrpMptToken, 0));

    expect(await screen.findByText("Part of this token is in escrow")).toBeVisible();
    expect(getContinueButton()).toBeDisabled();
  });

  it("lands on the error screen with a retry when signing fails", async () => {
    mockAccountBridge.signOperation.mockImplementationOnce(
      () =>
        new Observable<SignOperationEvent>(subscriber => {
          subscriber.next({ type: "device-signature-requested" });
          subscriber.error(new Error("UserRefusedOnDevice"));
        }),
    );
    const { user } = renderReview(makeTokenAccount(xrpIouToken, 0));

    await signFromReview(user);

    await waitFor(() => expect(screen.getByText("Retry")).toBeVisible(), { timeout: 15000 });
  });

  describe("closing the success screen", () => {
    it("goes back to the XRP account screen right below the token screen", async () => {
      const { user } = renderSuccessAbove([PARENT_ACCOUNT_ROUTE, TOKEN_ACCOUNT_ROUTE]);

      await user.press(await screen.findByTestId("enabled-success-close-button"));

      expect(await screen.findAllByTestId(`account-screen-${XRP_ACCOUNT.id}`)).toHaveLength(1);
      expect(screen.queryByTestId(`account-screen-${TOKEN_ACCOUNT.id}`)).toBeNull();
    });

    it("puts the XRP account screen in place of a token screen opened on its own", async () => {
      const { user } = renderSuccessAbove([TOKEN_ACCOUNT_ROUTE]);

      await user.press(await screen.findByTestId("enabled-success-close-button"));

      expect(await screen.findByTestId(`account-screen-${XRP_ACCOUNT.id}`)).toBeVisible();
      expect(screen.queryByTestId(`account-screen-${TOKEN_ACCOUNT.id}`)).toBeNull();
    });

    it("leaves a token screen of the navigator below the flow", async () => {
      const accountsRoute = {
        name: NavigatorName.Accounts,
        state: { index: 1, routes: [PARENT_ACCOUNT_ROUTE, TOKEN_ACCOUNT_ROUTE] },
      };
      const { user } = renderSuccessAbove([accountsRoute]);

      await user.press(await screen.findByTestId("enabled-success-close-button"));

      expect(await screen.findAllByTestId(`account-screen-${XRP_ACCOUNT.id}`)).toHaveLength(1);
      expect(screen.queryByTestId(`account-screen-${TOKEN_ACCOUNT.id}`)).toBeNull();
    });
  });
});
