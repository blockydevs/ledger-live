import React from "react";
import type { TokenCurrency } from "@ledgerhq/types-cryptoassets";
import { HEDERA_TRANSACTION_MODES } from "@ledgerhq/live-common/families/hedera/constants";
import { render, screen, waitFor } from "tests/testSetup";
import {
  deviceActionRequestSpy,
  mockBroadcast,
  mockDevice,
  setUpModalsContainer,
  tearDownModalsContainer,
  warmHederaBridgeCaches,
} from "../../__mocks__/hederaModalTestSetup";
import { HEDERA_ACCOUNT_1 } from "../../__mocks__/account.mock";
import { HederaCustomModal } from "../../constants";
import ReceiveWithAssociationModal from "../index";

// Desktop has no MOCK bridge for hedera, so without stubbing `useBridgeTransaction` the
// continue button stays disabled or StepAssociationDevice bails out on a missing transaction.
// Stub ONLY the transaction/status source; the step machine, isAssociationFlow, and the real
// broadcast/transitionTo flow stay real.
jest.mock("@ledgerhq/live-common/bridge/useBridgeTransaction", () => {
  const ReactLib = require("react");
  const { BigNumber: BN } = require("bignumber.js");
  return {
    __esModule: true,
    default: (_bridge: unknown, optionalInit?: () => Record<string, unknown>) => {
      const [state, setState] = ReactLib.useState(() => (optionalInit ? optionalInit() : {}));

      const updateTransaction = ReactLib.useCallback(
        (updater: (tx: unknown) => unknown) =>
          setState((prev: Record<string, unknown>) => ({
            ...prev,
            transaction: updater(prev.transaction),
          })),
        [],
      );
      const setAccount = ReactLib.useCallback(
        (account: unknown, parentAccount: unknown) =>
          setState((prev: Record<string, unknown>) => ({
            ...prev,
            account,
            parentAccount,
          })),
        [],
      );

      return {
        transaction: state.transaction,
        setTransaction: (transaction: unknown) =>
          setState((prev: Record<string, unknown>) => ({
            ...prev,
            transaction,
          })),
        updateTransaction,
        account: state.account,
        parentAccount: state.parentAccount,
        setAccount,
        updateAccount: () => {},
        status: {
          errors: {},
          warnings: {},
          estimatedFees: new BN(0),
          amount: new BN(0),
          totalSpent: new BN(0),
        },
        bridgeError: null,
        bridgePending: false,
      };
    },
  };
});

// SECURITY: desktop has no network blocking in its jest setup, so an unmocked broadcast
// would fire a real write against Hedera mainnet from CI. Must always be mocked.
jest.mock(
  "@ledgerhq/live-common/hooks/useBroadcast",
  () => require("../../__mocks__/hederaModalTestSetup").useBroadcastModuleMock,
);

// CAL-backed token list would otherwise hit a real network endpoint; just resolve it
// immediately so `StepAccount` mounts past its loading state (the token itself comes from
// the mocked SelectCurrency below).
jest.mock("@features/platform-currencies", () => ({
  ...jest.requireActual("@features/platform-currencies"),
  useTokensData: () => ({
    data: { tokens: [], pagination: { nextCursor: undefined } },
    isLoading: false,
    error: undefined,
    loadNext: undefined,
    isSuccess: true,
    isError: false,
    refetch: jest.fn(),
  }),
}));

// HTS token requiring association, picked by the user in the (real, unmocked) StepAccount.
// SelectCurrency wraps react-select + a virtualized list, both unusable in jsdom without a
// layout engine, so we swap it for a plain button that reports the same `onChange` contract.
const mockHtsToken: TokenCurrency = {
  type: "TokenCurrency",
  id: "hedera/hts/test_0.0.999999",
  contractAddress: "0.0.999999",
  parentCurrencyId: "hedera",
  tokenType: "hts",
  name: "Test HTS Token",
  ticker: "THTS",
  delisted: false,
  disableCountervalue: false,
  units: [{ name: "Test HTS Token", code: "THTS", magnitude: 6 }],
};

jest.mock("~/renderer/components/SelectCurrency", () => ({
  __esModule: true,
  default: ({ onChange }: { onChange: (token: unknown) => void }) => (
    <button type="button" data-testid="mock-select-token" onClick={() => onChange(mockHtsToken)}>
      Select HTS token
    </button>
  ),
}));

// Precedent: canton/PendingTransferProposals/__integrations__ - stub only the device widget,
// keep everything downstream of `onResult` real.
jest.mock(
  "~/renderer/components/DeviceAction",
  () => require("../../__mocks__/hederaModalTestSetup").deviceActionModuleMock,
);

const mockBroadcastedOperation = {
  ...HEDERA_ACCOUNT_1.operations[0],
  id: "mock-broadcasted-op",
  accountId: HEDERA_ACCOUNT_1.id,
};

describe("ReceiveWithAssociationModal [component]", () => {
  // Warm the bridge/family promise caches so React 19's `use()` doesn't suspend on first
  // render (no <Suspense> boundary in this test tree). Precedent: tezos/operationDetails.test.tsx.
  beforeAll(async () => {
    await warmHederaBridgeCaches(HEDERA_ACCOUNT_1);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockBroadcast.mockResolvedValue(mockBroadcastedOperation);

    setUpModalsContainer();
  });

  afterEach(() => {
    tearDownModalsContainer();
  });

  const buildInitialState = () => ({
    accounts: [HEDERA_ACCOUNT_1],
    devices: { currentDevice: mockDevice, devices: [mockDevice] },
    modals: {
      [HederaCustomModal.RECEIVE_WITH_ASSOCIATION]: {
        isOpened: true,
        data: { account: HEDERA_ACCOUNT_1, receiveTokenMode: true },
      },
    },
  });

  it("associates a token: account -> device -> success (happy path)", async () => {
    const { user } = render(<ReceiveWithAssociationModal />, {
      initialState: buildInitialState(),
    });

    // Real StepAccount / TokenSelection: pick the HTS token that requires association.
    await user.click(await screen.findByTestId("mock-select-token"));

    const continueButton = await screen.findByTestId("modal-continue-button");
    await waitFor(() => expect(continueButton).toBeEnabled());
    await user.click(continueButton);

    // Real isAssociationFlow -> "associationDevice" step (not the plain "device" step).
    const confirmButton = await screen.findByTestId("mock-device-confirm-success");

    // Assert the actual transaction handed to the signer (real Body/StepAccount logic),
    // not just the synthetic signed operation asserted below.
    const request = deviceActionRequestSpy.mock.lastCall?.[0];
    expect(request.transaction).toEqual(
      expect.objectContaining({
        family: "hedera",
        mode: HEDERA_TRANSACTION_MODES.TokenAssociate,
        assetReference: mockHtsToken.contractAddress,
      }),
    );
    if (request.tokenCurrency) {
      expect(request.tokenCurrency.id).toBe(mockHtsToken.id);
    }

    await user.click(confirmButton);

    await waitFor(() => expect(mockBroadcast).toHaveBeenCalledWith({ id: "signed-op-1" }));

    expect(await screen.findByText("Transaction sent")).toBeInTheDocument();
    expect(
      screen.getByText(
        "You will be able to receive this token once the Associate Token transaction has been confirmed",
      ),
    ).toBeInTheDocument();
  });

  it("shows an error and never broadcasts when the device rejects the transaction", async () => {
    const { user } = render(<ReceiveWithAssociationModal />, {
      initialState: buildInitialState(),
    });

    await user.click(await screen.findByTestId("mock-select-token"));

    const continueButton = await screen.findByTestId("modal-continue-button");
    await waitFor(() => expect(continueButton).toBeEnabled());
    await user.click(continueButton);

    const rejectButton = await screen.findByTestId("mock-device-confirm-error");

    // Assert the actual transaction handed to the signer before it gets rejected.
    const request = deviceActionRequestSpy.mock.lastCall?.[0];
    expect(request.transaction).toEqual(
      expect.objectContaining({
        family: "hedera",
        mode: HEDERA_TRANSACTION_MODES.TokenAssociate,
        assetReference: mockHtsToken.contractAddress,
      }),
    );
    if (request.tokenCurrency) {
      expect(request.tokenCurrency.id).toBe(mockHtsToken.id);
    }

    await user.click(rejectButton);

    expect(await screen.findByText("device sign rejected")).toBeInTheDocument();
    expect(mockBroadcast).not.toHaveBeenCalled();

    // StepAssociationConfirmationFooter only renders a Retry button on the error branch.
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});
