import React from "react";
import { Observable } from "rxjs";
import BigNumber from "bignumber.js";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { AccountLike, SignOperationEvent } from "@ledgerhq/types-live";
import { render, screen, waitFor } from "@tests/test-renderer";
import type { AleoAccount, AleoResources } from "@ledgerhq/live-common/families/aleo/types";
import { AleoNoClaimableAmount } from "@ledgerhq/live-common/families/aleo/errors";
import { NavigatorName, ScreenName } from "~/const";
import { NotificationsPromptProvider } from "LLM/features/NotificationsPrompt";
import { ALEO_ACCOUNT_1 } from "../../__mocks__/account.mock";
import { component as ClaimUnbondFlowNavigator } from "../index";

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
    id: "op-claim-1",
    hash: "0xclaim",
    type: "CLAIM" as const,
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
  amount: new BigNumber(0),
  totalSpent: new BigNumber(1000),
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
    mode: "claim_unbond_public",
    amount: new BigNumber(0),
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

function ClaimUnbondFlowHarness() {
  return (
    <NotificationsPromptProvider>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name={NavigatorName.AleoClaimUnbondFlow} component={ClaimUnbondFlowNavigator} />
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

function renderSelectDeviceStep(account: AleoAccount) {
  return render(<ClaimUnbondFlowHarness />, {
    navigationInitialState: {
      index: 0,
      routes: [
        {
          name: NavigatorName.AleoClaimUnbondFlow,
          state: {
            index: 0,
            routes: [
              {
                name: ScreenName.AleoClaimUnbondSelectDevice,
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

// Shared fixture: 2 000 ALEO unbonding, past its unbonding height, so it is claimable.
const CLAIMABLE_ACCOUNT = {
  ...aleoAccountWith({
    transparentBalance: new BigNumber(5 * CREDIT),
    unbondingBalance: new BigNumber(2_000 * CREDIT),
    unbondingHeight: 10_000,
  }),
  blockHeight: 10_001,
};

describe("Aleo claim unbond flow (integration)", () => {
  beforeEach(() => {
    mockAccountBridge.createTransaction.mockClear();
    mockAccountBridge.updateTransaction.mockClear();
    mockAccountBridge.signOperation.mockClear();
    mockGetTransactionStatus.mockImplementation(async () => DEFAULT_STATUS);
  });

  it("walks device → success without asking for an amount", async () => {
    const { user } = renderSelectDeviceStep(CLAIMABLE_ACCOUNT);

    await user.press(await screen.findByTestId("device-item-mock"));

    await waitFor(() => expect(screen.getByTestId("validate-success-screen")).toBeVisible(), {
      timeout: 10_000,
    });
  }, 30_000);

  it("builds a claim_unbond_public transaction pinned to the account's own address", async () => {
    renderSelectDeviceStep(CLAIMABLE_ACCOUNT);

    await waitFor(() => expect(mockAccountBridge.updateTransaction).toHaveBeenCalled());
    expect(mockAccountBridge.updateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ family: "aleo" }),
      { mode: "claim_unbond_public", recipient: CLAIMABLE_ACCOUNT.freshAddress },
    );
  });

  it("blocks device selection and surfaces the error when the claim status reports no claimable amount", async () => {
    mockStatus({ errors: { amount: new AleoNoClaimableAmount() } });

    renderSelectDeviceStep(CLAIMABLE_ACCOUNT);

    await waitFor(() => expect(screen.getByTestId("aleo-claim-status-error")).toBeVisible());
    // No device to press means onSelect can never fire and the flow can never reach signing.
    expect(screen.queryByTestId("device-item-mock")).toBeNull();
    expect(mockAccountBridge.signOperation).not.toHaveBeenCalled();
  });
});
