import React from "react";
import BigNumber from "bignumber.js";
import { render, screen, fireEvent, waitFor, act } from "@tests/test-renderer";
import type { Operation } from "@ledgerhq/types-live";
import { getCurrencyConfiguration } from "@ledgerhq/live-common/config/index";
import type {
  AleoAccount,
  AleoResources,
  AleoValidator,
} from "@ledgerhq/live-common/families/aleo/types";
import { ALEO_ACCOUNT_1 } from "../../__mocks__/account.mock";
import { useAleoLiveBlockHeight } from "../../hooks/useAleoLiveBlockHeight";
import Staking from "../index";

jest.mock("@ledgerhq/live-common/config/index", () => ({
  getCurrencyConfiguration: jest.fn(),
}));

// useStakingPosition resolves the validator committee through useAleoValidators, which reads it
// from the coin module's getValidators — mocking it here (rather than useAleoValidators itself,
// which useStakingPosition calls as a same-module closure jest.mock cannot intercept) is what
// actually reaches useStakingPosition's real code path. `coin-aleo` is not one of live-mobile's
// own dependencies (only live-common's), so it has no type declarations here either: the module
// is mocked virtually, and the mock fn is read back via requireMock instead of being imported.
jest.mock("@ledgerhq/coin-aleo/logic", () => ({ getValidators: jest.fn() }), { virtual: true });

type GetValidatorsMock = jest.Mock<Promise<AleoValidator[]>, [string]>;
const mockGetValidators: GetValidatorsMock = (
  jest.requireMock("@ledgerhq/coin-aleo/logic") as { getValidators: GetValidatorsMock }
).getValidators;

jest.mock("../../hooks/useAleoLiveBlockHeight", () => ({
  useAleoLiveBlockHeight: jest.fn(),
}));

// AccountDelegationInfo renders a deprecated native-ui Button that needs a focused screen;
// only the CTA text and press handler matter to this section's empty-state gating.
jest.mock("~/components/AccountDelegationInfo", () => {
  const { TouchableOpacity, Text } = jest.requireActual("react-native");
  return {
    __esModule: true,
    default: ({ onPress, ctaTitle }: { onPress: () => void; ctaTitle: string }) => (
      <TouchableOpacity testID="aleo-staking-empty-cta" onPress={onPress}>
        <Text>{ctaTitle}</Text>
      </TouchableOpacity>
    ),
  };
});

// DelegationDrawer's internals (currency icon, counter value, safe-area insets) are unrelated
// to what this section decides, so the drawer is reduced to its data/actions contract.
jest.mock("~/components/DelegationDrawer", () => {
  const { View, Text, TouchableOpacity } = jest.requireActual("react-native");
  return {
    __esModule: true,
    default: ({
      isOpen,
      data,
      actions,
    }: {
      isOpen: boolean;
      data: { label: string; Component: React.ReactNode }[];
      actions: { label?: string; event?: string; disabled?: boolean; onPress?: () => void }[];
    }) =>
      isOpen ? (
        <View testID="aleo-manage-drawer">
          {data.map((field, i) => (
            <Text key={i}>{field.Component}</Text>
          ))}
          {actions.map(action => (
            <TouchableOpacity
              key={action.event}
              testID={action.event}
              disabled={action.disabled}
              onPress={action.onPress}
            >
              <Text>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null,
  };
});

const mockGetCurrencyConfiguration = jest.mocked(getCurrencyConfiguration);
const mockUseAleoLiveBlockHeight = jest.mocked(useAleoLiveBlockHeight);

const baseAleoResources: AleoResources = {
  transparentBalance: new BigNumber(0),
  provableApi: null,
  privateBalance: null,
  unspentPrivateRecords: null,
  lastPrivateSyncDate: null,
};

const VALIDATOR_ADDRESS = "aleo1validator";

function pendingOperation(type: "UNBOND" | "WITHDRAW_UNBONDED"): Operation {
  return { type } as unknown as Operation;
}

function makeAccount(overrides: Partial<AleoAccount> = {}): AleoAccount {
  return {
    ...(ALEO_ACCOUNT_1 as AleoAccount),
    blockHeight: 5000,
    pendingOperations: [],
    aleoResources: { ...baseAleoResources },
    ...overrides,
  };
}

function makeConfig(enableStaking: boolean): ReturnType<typeof getCurrencyConfiguration> {
  return {
    status: { type: "active" },
    networkType: "mainnet",
    enableStaking,
  } as ReturnType<typeof getCurrencyConfiguration>;
}

function makeValidator(overrides: Partial<AleoValidator> = {}): AleoValidator {
  return {
    address: VALIDATOR_ADDRESS,
    name: "Validator One",
    stakeMicrocredits: 0,
    isOpen: true,
    isUnbonding: false,
    commissionPercent: 5,
    estimatedYearlyRewardsRate: 0.07,
    ...overrides,
  };
}

describe("Staking section", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrencyConfiguration.mockReturnValue(makeConfig(true));
    mockGetValidators.mockResolvedValue([]);
    mockUseAleoLiveBlockHeight.mockReturnValue(5000);
  });

  it("renders nothing when staking is disabled in the currency config", () => {
    mockGetCurrencyConfiguration.mockReturnValue(makeConfig(false));

    const { toJSON } = render(<Staking account={makeAccount()} />);

    expect(toJSON()).toBeNull();
  });

  it("offers the bond CTA when there is no position", async () => {
    render(<Staking account={makeAccount()} />);

    expect(screen.getByText("Earn rewards")).toBeOnTheScreen();
    await act(async () => {});
  });

  it("shows the staked amount and validator label for a bonded position", async () => {
    mockGetValidators.mockResolvedValue([makeValidator()]);
    const account = makeAccount({
      aleoResources: {
        ...baseAleoResources,
        bondedBalance: new BigNumber(20_000_000),
        bondedValidator: VALIDATOR_ADDRESS,
      },
    });

    render(<Staking account={account} />);

    await waitFor(() => expect(screen.getByText("Validator One")).toBeOnTheScreen());
    expect(screen.getByText("7.0% est.")).toBeOnTheScreen();
    expect(screen.getByTestId("aleo-staked-amount")).toBeOnTheScreen();
    expect(screen.getByTestId("aleo-status-earning")).toBeOnTheScreen();
  });

  it("disables both drawer actions while an unbond is pending", async () => {
    const account = makeAccount({
      pendingOperations: [pendingOperation("UNBOND")],
      aleoResources: {
        ...baseAleoResources,
        bondedBalance: new BigNumber(20_000_000),
        bondedValidator: VALIDATOR_ADDRESS,
      },
    });

    render(<Staking account={account} />);
    fireEvent.press(screen.getByTestId("aleo-staked-row"));

    expect(screen.getByTestId("AleoManageUnstake")).toBeDisabled();
    expect(screen.getByTestId("AleoManageClaim")).toBeDisabled();
    await act(async () => {});
  });

  it("enables Claim only once the unbonding entry is claimable", async () => {
    const account = makeAccount({
      blockHeight: 10_000,
      aleoResources: {
        ...baseAleoResources,
        bondedBalance: new BigNumber(20_000_000),
        bondedValidator: VALIDATOR_ADDRESS,
        unbondingBalance: new BigNumber(5_000_000),
        unbondingHeight: 10_000,
      },
    });

    render(<Staking account={account} />);
    fireEvent.press(screen.getByTestId("aleo-staked-row"));

    expect(screen.getByTestId("AleoManageClaim")).toBeEnabled();
    await act(async () => {});
  });

  it("renders the block countdown while the unbonding period is running", async () => {
    mockUseAleoLiveBlockHeight.mockReturnValue(9_950);
    const account = makeAccount({
      blockHeight: 9_900,
      aleoResources: {
        ...baseAleoResources,
        unbondingBalance: new BigNumber(5_000_000),
        unbondingHeight: 10_000,
      },
    });

    render(<Staking account={account} />);

    expect(screen.getByText("~50 blocks left")).toBeOnTheScreen();
    await act(async () => {});
  });

  it("renders the settling label once the live height passed but the sync has not", async () => {
    mockUseAleoLiveBlockHeight.mockReturnValue(10_010);
    const account = makeAccount({
      blockHeight: 9_990,
      aleoResources: {
        ...baseAleoResources,
        unbondingBalance: new BigNumber(5_000_000),
        unbondingHeight: 10_000,
      },
    });

    render(<Staking account={account} />);

    expect(screen.getByTestId("aleo-unstaking-settling")).toBeOnTheScreen();
    await act(async () => {});
  });
});
