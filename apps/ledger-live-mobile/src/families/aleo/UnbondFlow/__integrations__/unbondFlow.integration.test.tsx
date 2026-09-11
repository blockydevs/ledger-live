import React from "react";
import { Observable } from "rxjs";
import BigNumber from "bignumber.js";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { AccountLike, SignOperationEvent } from "@ledgerhq/types-live";
import { render, screen, waitFor, within } from "@tests/test-renderer";
import type { AleoAccount, AleoResources } from "@ledgerhq/live-common/families/aleo/types";
import { NotEnoughBalance } from "@ledgerhq/ledger-wallet-framework/errors";
import { NavigatorName, ScreenName } from "~/const";
import { NotificationsPromptProvider } from "LLM/features/NotificationsPrompt";
import { ALEO_ACCOUNT_1 } from "../../__mocks__/account.mock";
import { component as UnbondFlowNavigator } from "../index";

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

jest.mock("~/datadog", () => ({
  isDatadogEnabled: false,
  initializeDatadogProvider: jest.fn(),
  customErrorEventMapper: jest.fn(),
  customActionEventMapper: jest.fn(),
  customLogEventMapper: jest.fn(),
  viewNamePredicate: jest.fn(),
  broadcastLogger: jest.fn(),
}));

jest.mock("@ledgerhq/live-common/families/aleo/react", () => ({
  ...jest.requireActual("@ledgerhq/live-common/families/aleo/react"),
  useAleoValidators: () => ({ validators: [], loading: false, error: null }),
}));

jest.mock("@ledgerhq/live-common/config/index", () => ({
  getCurrencyConfiguration: () => ({ networkType: "mainnet", enableStaking: true }),
}));

const mockSignedOperation = {
  signature: "sig",
  operation: {
    id: "op-unbond-1",
    hash: "0xunbond",
    type: "UNBOND" as const,
    value: new BigNumber(0),
    fee: new BigNumber(0),
    senders: [],
    recipients: [],
    blockHeight: null,
    blockHash: null,
    accountId: ALEO_ACCOUNT_1.id,
    date: new Date(),
    extra: {},
  },
  expirationDate: undefined,
};

const DEFAULT_STATUS = {
  errors: {} as Record<string, Error>,
  warnings: {} as Record<string, Error>,
  estimatedFees: new BigNumber(1000),
  amount: new BigNumber(1_000_000),
  totalSpent: new BigNumber(1_001_000),
};

const mockGetTransactionStatus = jest.fn(async () => DEFAULT_STATUS);

// Makes every subsequent getTransactionStatus call resolve to DEFAULT_STATUS merged with overrides.
function mockStatus(overrides: Partial<typeof DEFAULT_STATUS>) {
  mockGetTransactionStatus.mockImplementation(async () => ({ ...DEFAULT_STATUS, ...overrides }));
}

const CREDIT = 1_000_000;

const mockAccountBridge = {
  createTransaction: jest.fn((_account: AccountLike) => ({
    family: "aleo" as const,
    mode: "unbond_public",
    amount: new BigNumber(1_000 * CREDIT),
    recipient: "aleo1staker",
    useAllAmount: false,
    subAccountId: undefined,
  })),
  updateTransaction: jest.fn((tx: object, patch: object) => ({ ...tx, ...patch })),
  prepareTransaction: async (_account: AccountLike, tx: unknown) => tx,
  getTransactionStatus: () => mockGetTransactionStatus(),
  estimateMaxSpendable: async () => new BigNumber(100_000_000),
  getStuckAccountAndOperation: () => null,
  isAccountEmpty: () => false,
  signOperation: jest.fn(
    () =>
      new Observable<SignOperationEvent>(subscriber => {
        subscriber.next({ type: "device-signature-requested" });
        subscriber.next({ type: "device-signature-granted" });
        subscriber.next({ type: "signed", signedOperation: mockSignedOperation as never });
        subscriber.complete();
      }),
  ),
  broadcast: async ({ signedOperation }: { signedOperation: typeof mockSignedOperation }) =>
    signedOperation.operation,
};

jest.mock("@ledgerhq/live-common/bridge/index", () => ({
  __esModule: true,
  getAccountBridge: () =>
    Object.assign(Promise.resolve(mockAccountBridge), {
      status: "fulfilled" as const,
      value: mockAccountBridge,
    }),
  getCurrencyBridge: () => {
    const cb = { preload: () => Promise.resolve(true), hydrate: () => true };
    return Object.assign(Promise.resolve(cb), { status: "fulfilled" as const, value: cb });
  },
}));

const Stack = createNativeStackNavigator();

function UnbondFlowHarness() {
  return (
    <NotificationsPromptProvider>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name={NavigatorName.AleoUnbondFlow} component={UnbondFlowNavigator} />
      </Stack.Navigator>
    </NotificationsPromptProvider>
  );
}

// Builds an AleoAccount with fully-specified aleoResources for staking-state fixtures.
function aleoAccountWith(resources: Partial<AleoResources>): AleoAccount {
  return {
    ...ALEO_ACCOUNT_1,
    aleoResources: {
      transparentBalance: new BigNumber(0),
      provableApi: null,
      privateBalance: null,
      unspentPrivateRecords: null,
      lastPrivateSyncDate: null,
      ...resources,
    },
  };
}

function renderAmountStep(account: AleoAccount) {
  return render(<UnbondFlowHarness />, {
    navigationInitialState: {
      index: 0,
      routes: [
        {
          name: NavigatorName.AleoUnbondFlow,
          state: {
            index: 0,
            routes: [
              {
                name: ScreenName.AleoUnbondAmount,
                params: { accountId: account.id },
              },
            ],
          },
        },
      ],
    },
    overrideInitialState: state => ({
      ...state,
      accounts: { ...state.accounts, active: [account] },
    }),
  });
}

// Shared fixture: 50 000 ALEO bonded to Figment, nothing unbonding.
const BONDED_ACCOUNT = aleoAccountWith({
  transparentBalance: new BigNumber(5 * CREDIT),
  bondedBalance: new BigNumber(50_000 * CREDIT),
  bondedValidator: "aleo1figment000",
  unbondingBalance: new BigNumber(0),
  unbondingHeight: null,
});

describe("Aleo unbond flow (integration)", () => {
  beforeEach(() => {
    mockAccountBridge.createTransaction.mockClear();
    mockAccountBridge.updateTransaction.mockClear();
    mockAccountBridge.signOperation.mockClear();
    mockGetTransactionStatus.mockImplementation(async () => DEFAULT_STATUS);
  });

  it("walks Amount → device → success", async () => {
    const { user } = renderAmountStep(BONDED_ACCOUNT);

    const continueButton = await screen.findByTestId("aleo-unbond-amount-continue");
    await waitFor(() => expect(continueButton).toBeEnabled());
    await user.press(continueButton);

    await user.press(await screen.findByTestId("device-item-mock"));

    await waitFor(() => expect(screen.getByTestId("validate-success-screen")).toBeVisible(), {
      timeout: 10_000,
    });
  }, 30_000);

  it("shows the maximum unbondable amount from the bonded balance", async () => {
    renderAmountStep(BONDED_ACCOUNT);

    const banner = await screen.findByTestId("aleo-unbond-unbondable-banner");
    await waitFor(() => expect(within(banner).getByText(/50,000 ALEO/)).toBeVisible());
  });

  // 50 000 bonded minus 45 000 leaves 5 000, under the 10 000 minimum.
  it("warns exactly when the typed amount would leave less than the minimum bonded", async () => {
    mockStatus({ amount: new BigNumber(45_000 * CREDIT) });

    renderAmountStep(BONDED_ACCOUNT);

    await waitFor(() => expect(screen.getByTestId("aleo-unbond-below-minimum")).toBeVisible());
  });

  it("does not warn when the remaining bonded balance stays above the minimum", async () => {
    mockStatus({ amount: new BigNumber(10_000 * CREDIT) });

    renderAmountStep(BONDED_ACCOUNT);

    await waitFor(() => expect(screen.getByTestId("aleo-unbond-unbondable-banner")).toBeVisible());
    expect(screen.queryByTestId("aleo-unbond-below-minimum")).toBeNull();
  });

  it("does not warn when unbonding everything", async () => {
    mockAccountBridge.createTransaction.mockReturnValueOnce({
      family: "aleo",
      mode: "unbond_public",
      amount: new BigNumber(50_000 * CREDIT),
      recipient: "aleo1staker",
      useAllAmount: true,
      subAccountId: undefined,
    });
    mockStatus({ amount: new BigNumber(50_000 * CREDIT) });

    renderAmountStep(BONDED_ACCOUNT);

    await waitFor(() => expect(screen.getByTestId("aleo-unbond-unbondable-banner")).toBeVisible());
    expect(screen.queryByTestId("aleo-unbond-below-minimum")).toBeNull();
  });

  it("warns that a second unstake merges with the one in flight and restarts the countdown", async () => {
    renderAmountStep({
      ...aleoAccountWith({
        transparentBalance: new BigNumber(5 * CREDIT),
        bondedBalance: new BigNumber(50_000 * CREDIT),
        bondedValidator: "aleo1figment000",
        unbondingBalance: new BigNumber(1_000 * CREDIT),
        unbondingHeight: 10_000,
      }),
      // below unbondingHeight: the entry has not settled yet, so it is not claimable.
      blockHeight: 9_999,
    });

    await waitFor(() => expect(screen.getByTestId("aleo-unbond-merge-warning")).toBeVisible());
    expect(screen.queryByTestId("aleo-unbond-claim-first")).toBeNull();
  });

  // blockHeight past unbondingHeight makes the entry claimable, so the copy points at claiming.
  it("tells the user to claim first when funds are already claimable", async () => {
    const account = {
      ...aleoAccountWith({
        transparentBalance: new BigNumber(5 * CREDIT),
        bondedBalance: new BigNumber(50_000 * CREDIT),
        bondedValidator: "aleo1figment000",
        unbondingBalance: new BigNumber(1_000 * CREDIT),
        unbondingHeight: 10_000,
      }),
      blockHeight: 10_001,
    };

    renderAmountStep(account);

    await waitFor(() => expect(screen.getByTestId("aleo-unbond-claim-first")).toBeVisible());
    expect(screen.queryByTestId("aleo-unbond-merge-warning")).toBeNull();
  });

  it("disables Continue at a zero amount", async () => {
    mockStatus({ amount: new BigNumber(0) });

    renderAmountStep(BONDED_ACCOUNT);

    await waitFor(() => expect(screen.getByTestId("aleo-unbond-amount-continue")).toBeDisabled());
  });

  it("renders a NotEnoughBalance status error", async () => {
    mockStatus({ errors: { amount: new NotEnoughBalance() } });

    renderAmountStep(BONDED_ACCOUNT);

    await waitFor(() => expect(screen.getByTestId("aleo-unbond-amount-continue")).toBeDisabled());
  });
});
