import React from "react";
import { Observable } from "rxjs";
import BigNumber from "bignumber.js";
import { TextInput } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { AccountLike, SignOperationEvent } from "@ledgerhq/types-live";
import { fireEvent, render, screen, waitFor } from "@tests/test-renderer";
import { shortAddressPreview } from "@ledgerhq/live-common/account/index";
import type { AleoAccount, AleoResources } from "@ledgerhq/live-common/families/aleo/types";
import {
  AleoAlreadyBondedElsewhere,
  AleoBondAmountTooLow,
  AleoClosedValidator,
  AleoStakeAmountTooLow,
  AleoUnbondingValidator,
} from "@ledgerhq/live-common/families/aleo/errors";
import { AmountRequired, NotEnoughBalance } from "@ledgerhq/ledger-wallet-framework/errors";
import { NavigatorName, ScreenName } from "~/const";
import { NotificationsPromptProvider } from "LLM/features/NotificationsPrompt";
import { ALEO_ACCOUNT_1 } from "../../__mocks__/account.mock";
import { component as BondPublicFlowNavigator } from "../index";

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

const mockUseAleoValidators = jest.fn();
jest.mock("@ledgerhq/live-common/families/aleo/react", () => ({
  useAleoValidators: (...args: unknown[]) => mockUseAleoValidators(...args),
}));

jest.mock("@ledgerhq/live-common/config/index", () => ({
  getCurrencyConfiguration: () => ({ networkType: "mainnet", enableStaking: true }),
}));

const mockSignedOperation = {
  signature: "sig",
  operation: {
    id: "op-bond-1",
    hash: "0xbond",
    type: "STAKE" as const,
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

const mockAccountBridge = {
  createTransaction: jest.fn((_account: AccountLike) => ({
    family: "aleo" as const,
    mode: "bond_public",
    amount: new BigNumber(1_000_000),
    recipient: "aleo1figment000",
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

const VALIDATOR_ADDRESS = "aleo1q3vx8pet0h7739hx5xlekfxh9kus6qdlxhx9qdkxhh9rnva8q5gsskve3t";

const Stack = createNativeStackNavigator();

function BondFlowHarness() {
  return (
    <NotificationsPromptProvider>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name={NavigatorName.AleoBondPublicFlow} component={BondPublicFlowNavigator} />
      </Stack.Navigator>
    </NotificationsPromptProvider>
  );
}

const MOCK_VALIDATORS = [
  {
    address: VALIDATOR_ADDRESS,
    name: "Figment",
    isOpen: true,
    isUnbonding: false,
    commissionPercent: 10,
    stakeMicrocredits: 1_000_000_000,
    nonEarningReason: null,
    estimatedYearlyRewardsRate: 0.05,
  },
];

function renderSelectValidatorStep(account: AleoAccount = ALEO_ACCOUNT_1) {
  return render(<BondFlowHarness />, {
    navigationInitialState: {
      index: 0,
      routes: [
        {
          name: NavigatorName.AleoBondPublicFlow,
          state: {
            index: 0,
            routes: [
              {
                name: ScreenName.AleoBondPublicSelectValidator,
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

const CREDIT = 1_000_000;

function renderAmountStep(account: AleoAccount) {
  return render(<BondFlowHarness />, {
    navigationInitialState: {
      index: 0,
      routes: [
        {
          name: NavigatorName.AleoBondPublicFlow,
          state: {
            index: 0,
            routes: [
              {
                name: ScreenName.AleoBondPublicAmount,
                params: { accountId: account.id, validatorAddress: VALIDATOR_ADDRESS },
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

// Shared fixture: 50 000 ALEO public balance, nothing bonded.
const FUNDED_ACCOUNT = aleoAccountWith({
  transparentBalance: new BigNumber(50_000 * CREDIT),
  bondedBalance: new BigNumber(0),
  bondedValidator: null,
});

describe("Aleo bond flow (integration)", () => {
  beforeEach(() => {
    mockAccountBridge.createTransaction.mockClear();
    mockAccountBridge.updateTransaction.mockClear();
    mockAccountBridge.signOperation.mockClear();
    mockGetTransactionStatus.mockImplementation(async () => DEFAULT_STATUS);
    mockUseAleoValidators.mockReturnValue({
      validators: MOCK_VALIDATORS,
      loading: false,
      error: null,
    });
  });

  it("walks Validator → Amount → device → success without a Summary step", async () => {
    const { user } = render(<BondFlowHarness />, {
      navigationInitialState: {
        index: 0,
        routes: [
          {
            name: NavigatorName.AleoBondPublicFlow,
            state: {
              index: 0,
              routes: [
                {
                  name: ScreenName.AleoBondPublicSelectValidator,
                  params: { accountId: FUNDED_ACCOUNT.id },
                },
              ],
            },
          },
        ],
      },
      overrideInitialState: state => ({
        ...state,
        accounts: { ...state.accounts, active: [FUNDED_ACCOUNT] },
      }),
    });

    await waitFor(() => expect(screen.getByText("Figment")).toBeVisible());
    await user.press(screen.getByText("Figment"));
    await user.press(screen.getByText(/continue/i));

    const amountContinue = await screen.findByTestId("aleo-bond-amount-continue");
    // Native stack duplicates the header label while the outgoing screen is still mounted.
    expect(screen.getAllByText("2 of 2")[0]).toBeVisible();
    await waitFor(() => expect(amountContinue).toBeEnabled());
    await user.press(amountContinue);

    await user.press(await screen.findByTestId("device-item-mock"));

    await waitFor(() => expect(screen.getByTestId("validate-success-screen")).toBeVisible(), {
      timeout: 10_000,
    });
  }, 30_000);

  it("SelectValidator renders validator list and Continue navigates to Amount", async () => {
    const { user } = renderSelectValidatorStep();

    await waitFor(() => expect(screen.getByText("Figment")).toBeVisible());
    await user.press(screen.getByText("Figment"));
    await user.press(screen.getByText(/continue/i));

    // Amount screen renders the available-balance line
    await waitFor(() => expect(screen.getByText(/available/i)).toBeVisible());
  }, 15_000);

  it("SelectValidator hides the validator list while loading", async () => {
    mockUseAleoValidators.mockReturnValueOnce({ validators: [], loading: true, error: null });

    renderSelectValidatorStep();

    // While loading, no validator names should be shown
    await waitFor(() => expect(screen.queryByText("Figment")).toBeNull());
  }, 10_000);

  it("Amount Continue is disabled when amount is zero", async () => {
    mockStatus({ amount: new BigNumber(0) });

    renderAmountStep(FUNDED_ACCOUNT);

    await waitFor(() => expect(screen.getByText(/available/i)).toBeVisible());
    expect(screen.getByTestId("aleo-bond-amount-continue")).toBeDisabled();
  }, 10_000);

  it("Amount shows the estimated fees from the transaction status", async () => {
    mockStatus({ estimatedFees: new BigNumber(25_000) });

    renderAmountStep(FUNDED_ACCOUNT);

    await waitFor(() => expect(screen.getByText(/0\.025 ALEO/)).toBeVisible());
  }, 10_000);

  it("Amount toggles useAllAmount through the switch and locks the input", async () => {
    renderAmountStep(FUNDED_ACCOUNT);

    const toggle = await screen.findByTestId("aleo-bond-use-all-amount");
    expect(screen.getByTestId("aleo-bond-amount-input")).toBeEnabled();

    fireEvent(toggle, "valueChange", true);

    await waitFor(() =>
      expect(mockAccountBridge.updateTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ useAllAmount: true }),
      ),
    );
    await waitFor(() => expect(screen.getByTestId("aleo-bond-amount-input")).toBeDisabled());

    fireEvent(toggle, "valueChange", false);

    await waitFor(() =>
      expect(mockAccountBridge.updateTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ useAllAmount: false }),
      ),
    );
  }, 15_000);

  it("Amount shows the plain minimum for an account with nothing bonded", async () => {
    renderAmountStep(FUNDED_ACCOUNT);

    // The full sentence disambiguates the minimum row from the staking hint above it,
    // which also mentions "10,000 ALEO".
    await waitFor(() => expect(screen.getByText(/Minimum bond amount: 10,000 ALEO/)).toBeVisible());
    expect(screen.queryByText(/Add at least/)).toBeNull();
  }, 10_000);

  it("Amount shows the top-up minimum for an account with an existing bond", async () => {
    const toppingUp = aleoAccountWith({
      transparentBalance: new BigNumber(50_000 * CREDIT),
      bondedBalance: new BigNumber(6_000 * CREDIT),
      bondedValidator: VALIDATOR_ADDRESS,
    });

    renderAmountStep(toppingUp);

    await waitFor(() => expect(screen.getByText(/Add at least/)).toBeVisible());
    expect(screen.getByText(/4,000 ALEO/)).toBeVisible();
    // The full sentence disambiguates this row from the staking hint above it,
    // which also mentions "10,000 ALEO".
    expect(screen.getByText(/to reach the 10,000 ALEO total stake/)).toBeVisible();
  }, 10_000);

  it("Amount shows the plain minimum, not the top-up copy, once the bonded balance already clears the delegator minimum", async () => {
    const wellBonded = aleoAccountWith({
      transparentBalance: new BigNumber(50_000 * CREDIT),
      bondedBalance: new BigNumber(25_000 * CREDIT),
      bondedValidator: VALIDATOR_ADDRESS,
    });

    renderAmountStep(wellBonded);

    await waitFor(() => expect(screen.getByText(/Minimum bond amount:/)).toBeVisible());
    expect(screen.queryByText(/Add at least/)).toBeNull();
  }, 10_000);

  it("Amount shows the change-validator escape hatch immediately for a recipient error, before any amount is typed", async () => {
    mockStatus({
      amount: new BigNumber(0),
      errors: { recipient: new AleoAlreadyBondedElsewhere() },
    });

    renderAmountStep(FUNDED_ACCOUNT);

    expect(await screen.findByTestId("aleo-bond-change-validator")).toBeVisible();
    expect(screen.getByTestId("aleo-bond-amount-continue")).toBeDisabled();
  }, 10_000);

  it("Amount warns and disables the max switch when the public balance is below the minimum", async () => {
    const short = aleoAccountWith({
      transparentBalance: new BigNumber(3_016 * CREDIT),
      bondedBalance: new BigNumber(0),
      bondedValidator: null,
    });

    renderAmountStep(short);

    await waitFor(() => expect(screen.getByText(/short of the/)).toBeVisible());
    expect(screen.getByText(/6,984 ALEO/)).toBeVisible();
    expect(screen.getByTestId("aleo-bond-use-all-amount")).toBeDisabled();
  }, 10_000);

  it("Amount Continue navigates to SelectDevice with the bridge transaction", async () => {
    const { user } = renderAmountStep(FUNDED_ACCOUNT);

    const continueButton = await screen.findByTestId("aleo-bond-amount-continue");
    await waitFor(() => expect(continueButton).toBeEnabled());
    await user.press(continueButton);

    expect(await screen.findByTestId("device-item-mock")).toBeVisible();
  }, 15_000);

  it("SelectValidator renders commission as a whole percent", async () => {
    renderSelectValidatorStep();

    await waitFor(() => expect(screen.getByText("5.0% est. · 10% commission")).toBeVisible());
  }, 10_000);

  it("SelectValidator shows the validator name and its shortened address", async () => {
    renderSelectValidatorStep();

    await waitFor(() => expect(screen.getByText("Figment")).toBeVisible());
    expect(screen.getByText(shortAddressPreview(VALIDATOR_ADDRESS))).toBeVisible();
  }, 10_000);

  it("SelectValidator uses the shortened address as the title when the validator has no name", async () => {
    mockUseAleoValidators.mockReturnValue({
      validators: [{ ...MOCK_VALIDATORS[0], name: undefined }],
      loading: false,
      error: null,
    });

    renderSelectValidatorStep();

    const short = shortAddressPreview(VALIDATOR_ADDRESS);
    await waitFor(() => expect(screen.getAllByText(short)).toHaveLength(1));
  }, 10_000);

  describe("SelectValidator list states", () => {
    const SECOND_VALIDATOR = {
      address: "aleo1l7avejc23yv6e8nx4udjwz89dw6mg95dzsp936hf77yuhnjywv9syl0ywc",
      name: "Kiln",
      isOpen: true,
      isUnbonding: false,
      commissionPercent: 3,
      stakeMicrocredits: 500_000_000,
      estimatedYearlyRewardsRate: 0.07,
    };

    it("pre-selects the default validator so Continue is immediately enabled", async () => {
      renderSelectValidatorStep();

      await waitFor(() => expect(screen.getByText("Figment")).toBeVisible());
      expect(screen.getByText(/continue/i)).toBeEnabled();
    }, 10_000);

    it("locks the list to the bonded validator and hides the search box", async () => {
      mockUseAleoValidators.mockReturnValue({
        validators: [MOCK_VALIDATORS[0], SECOND_VALIDATOR],
        loading: false,
        error: null,
      });
      const bonded = aleoAccountWith({
        transparentBalance: new BigNumber(50_000 * CREDIT),
        bondedBalance: new BigNumber(6_000 * CREDIT),
        bondedValidator: VALIDATOR_ADDRESS,
      });

      const { user } = renderSelectValidatorStep(bonded);

      await waitFor(() => expect(screen.getByText("Figment")).toBeVisible());
      expect(screen.queryByText("Kiln")).toBeNull();
      expect(
        screen.getByText(
          "You are already bonded to this validator. Unbond first to switch validators.",
        ),
      ).toBeVisible();

      await user.press(screen.getByText("Figment"));
      await user.press(screen.getByText(/continue/i));

      const amountContinue = await screen.findByTestId("aleo-bond-amount-continue");
      expect(amountContinue).toBeVisible();
    }, 15_000);

    it("shows the fetch error with a retry and no free-text address field", async () => {
      mockUseAleoValidators.mockReturnValue({
        validators: [],
        loading: false,
        error: new Error("boom"),
      });

      const { user } = renderSelectValidatorStep();

      await waitFor(() =>
        expect(screen.getByText("Failed to load validators. Please try again.")).toBeVisible(),
      );
      expect(screen.UNSAFE_queryAllByType(TextInput)).toHaveLength(0);

      mockUseAleoValidators.mockReturnValue({
        validators: MOCK_VALIDATORS,
        loading: false,
        error: null,
      });
      await user.press(screen.getByText(/retry/i));

      await waitFor(() => expect(screen.getByText("Figment")).toBeVisible());
    }, 15_000);

    it("filters the list by name, by address fragment, and shows nothing on a miss", async () => {
      mockUseAleoValidators.mockReturnValue({
        validators: [MOCK_VALIDATORS[0], SECOND_VALIDATOR],
        loading: false,
        error: null,
      });

      const { user } = renderSelectValidatorStep();

      await waitFor(() => expect(screen.getByText("Figment")).toBeVisible());
      const searchBox = screen.getByTestId("delegation-search-pool-input");

      await user.type(searchBox, "kil");
      await waitFor(() => expect(screen.queryByText("Figment")).toBeNull());
      expect(screen.getByText("Kiln")).toBeVisible();

      await user.clear(searchBox);
      await user.type(searchBox, "aleo1q3vx8pe");
      await waitFor(() => expect(screen.queryByText("Kiln")).toBeNull());
      expect(screen.getByText("Figment")).toBeVisible();

      await user.clear(searchBox);
      await user.type(searchBox, "zzzz");
      await waitFor(() => expect(screen.queryByText("Figment")).toBeNull());
      expect(screen.queryByText("Kiln")).toBeNull();
    }, 20_000);
  });

  describe("Amount step errors", () => {
    it("renders AleoBondAmountTooLow and disables Continue", async () => {
      mockStatus({
        amount: new BigNumber(500_000),
        errors: { amount: new AleoBondAmountTooLow(undefined, { minAmount: "1 ALEO" }) },
      });

      renderAmountStep(FUNDED_ACCOUNT);

      await waitFor(() =>
        expect(screen.getByText("The minimum staking amount is 1 ALEO.")).toBeVisible(),
      );
      expect(screen.getByTestId("aleo-bond-amount-continue")).toBeDisabled();
      expect(screen.queryByTestId("aleo-bond-change-validator")).toBeNull();
    }, 10_000);

    it("renders AleoStakeAmountTooLow and disables Continue", async () => {
      mockStatus({
        amount: new BigNumber(2_000 * CREDIT),
        errors: { amount: new AleoStakeAmountTooLow(undefined, { minAmount: "10,000 ALEO" }) },
      });

      renderAmountStep(FUNDED_ACCOUNT);

      await waitFor(() =>
        expect(
          screen.getByText("You must have at least 10,000 ALEO staked in total."),
        ).toBeVisible(),
      );
      expect(screen.getByTestId("aleo-bond-amount-continue")).toBeDisabled();
    }, 10_000);

    it("renders NotEnoughBalance from the fees key and disables Continue", async () => {
      mockStatus({
        amount: new BigNumber(50_000 * CREDIT),
        errors: { fees: new NotEnoughBalance() },
      });

      renderAmountStep(FUNDED_ACCOUNT);

      await waitFor(() =>
        expect(screen.getByText("Please make sure the account has enough funds.")).toBeVisible(),
      );
      expect(screen.getByTestId("aleo-bond-amount-continue")).toBeDisabled();
    }, 10_000);

    it("renders AleoAlreadyBondedElsewhere and offers a way back to the picker", async () => {
      mockStatus({
        amount: new BigNumber(20_000 * CREDIT),
        errors: {
          recipient: new AleoAlreadyBondedElsewhere(undefined, { bondedValidator: "aleo1other" }),
        },
      });

      renderAmountStep(FUNDED_ACCOUNT);

      await waitFor(() =>
        expect(
          screen.getByText(
            "Aleo allows one validator per account. Unstake from aleo1other before staking elsewhere.",
          ),
        ).toBeVisible(),
      );
      expect(screen.getByTestId("aleo-bond-amount-continue")).toBeDisabled();
      expect(screen.getByTestId("aleo-bond-change-validator")).toBeVisible();
    }, 10_000);

    it("renders AleoClosedValidator and offers a way back to the picker", async () => {
      mockStatus({
        amount: new BigNumber(20_000 * CREDIT),
        errors: { recipient: new AleoClosedValidator() },
      });

      renderAmountStep(FUNDED_ACCOUNT);

      await waitFor(() =>
        expect(
          screen.getByText(
            "This validator is not accepting new delegators. Choose an open validator to continue.",
          ),
        ).toBeVisible(),
      );
      expect(screen.getByTestId("aleo-bond-change-validator")).toBeVisible();
    }, 10_000);

    it("prioritizes the recipient error over a simultaneous amount error", async () => {
      mockStatus({
        amount: new BigNumber(20_000 * CREDIT),
        errors: {
          recipient: new AleoClosedValidator(),
          amount: new AleoBondAmountTooLow(undefined, { minAmount: "1 ALEO" }),
        },
      });

      renderAmountStep(FUNDED_ACCOUNT);

      await waitFor(() =>
        expect(
          screen.getByText(
            "This validator is not accepting new delegators. Choose an open validator to continue.",
          ),
        ).toBeVisible(),
      );
      expect(screen.getByTestId("aleo-bond-change-validator")).toBeVisible();
      expect(screen.queryByText("The minimum staking amount is 1 ALEO.")).toBeNull();
    }, 10_000);

    it("renders AleoUnbondingValidator and offers a way back to the picker", async () => {
      mockStatus({
        amount: new BigNumber(20_000 * CREDIT),
        errors: { recipient: new AleoUnbondingValidator() },
      });

      renderAmountStep(FUNDED_ACCOUNT);

      await waitFor(() =>
        expect(
          screen.getByText(
            "This validator is withdrawing its own stake, so the network rejects new stake to it. Choose another validator to continue.",
          ),
        ).toBeVisible(),
      );
      expect(screen.getByTestId("aleo-bond-change-validator")).toBeVisible();
    }, 10_000);

    it("shows no error text for AmountRequired on an untouched screen but keeps Continue disabled", async () => {
      mockStatus({ amount: new BigNumber(0), errors: { amount: new AmountRequired() } });

      renderAmountStep(FUNDED_ACCOUNT);

      await waitFor(() => expect(screen.getByTestId("aleo-bond-amount-continue")).toBeDisabled());
      expect(screen.queryByText("Enter an amount to continue.")).toBeNull();
      expect(screen.queryByTestId("aleo-bond-change-validator")).toBeNull();
    }, 10_000);

    it("renders AmountRequired once the max switch owns the amount", async () => {
      mockStatus({ amount: new BigNumber(0), errors: { amount: new AmountRequired() } });

      renderAmountStep(FUNDED_ACCOUNT);

      fireEvent(await screen.findByTestId("aleo-bond-use-all-amount"), "valueChange", true);

      await waitFor(() => expect(screen.getByText("Enter an amount to continue.")).toBeVisible());
      expect(screen.getByTestId("aleo-bond-amount-continue")).toBeDisabled();
    }, 10_000);

    it("the change-validator button returns to SelectValidator", async () => {
      mockStatus({
        amount: new BigNumber(20_000 * CREDIT),
        errors: { recipient: new AleoClosedValidator() },
      });

      const { user } = renderAmountStep(FUNDED_ACCOUNT);

      await user.press(await screen.findByTestId("aleo-bond-change-validator"));

      await waitFor(() => expect(screen.getByText("Figment")).toBeVisible());
    }, 15_000);
  });
});
