import React from "react";
import { setHederaPreloadData } from "@ledgerhq/coin-hedera/preload-data";
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
import { hederaCurrency } from "../../__mocks__/currency.mock";
import { HEDERA_ACCOUNT_1 } from "../../__mocks__/account.mock";
import { HEDERA_VALIDATOR_1 } from "../../__mocks__/validator.mock";
import DelegationFlowModal from "../index";

// Parameterizes the stubbed `status.errors` below so tests can force a validation error
// (e.g. an amount error) without touching the real bridge. Must be prefixed with "mock" so
// the hoisted jest.mock factory (below) is allowed to close over it. Reset in `beforeEach`.
// eslint-disable-next-line prefer-const
let mockStatusErrors: Record<string, Error> = {};

// Same reasoning as ReceiveWithAssociationModal/__integrations__: stub only the
// transaction/status source, keep the step machine and real bridge `updateTransaction` in
// the loop, so picking a validator in the (real) StepValidator updates the transaction.
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
      const setTransaction = ReactLib.useCallback(
        (transaction: unknown) =>
          setState((prev: Record<string, unknown>) => ({
            ...prev,
            transaction,
          })),
        [],
      );

      return {
        transaction: state.transaction,
        setTransaction,
        updateTransaction,
        account: state.account,
        parentAccount: state.parentAccount,
        setAccount: () => {},
        updateAccount: () => {},
        status: {
          errors: mockStatusErrors,
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

// Precedent: canton/PendingTransferProposals/__integrations__ - stub only the device widget,
// keep everything downstream of `onResult` real.
jest.mock(
  "~/renderer/components/DeviceAction",
  () => require("../../__mocks__/hederaModalTestSetup").deviceActionModuleMock,
);

const mockBroadcastedOperation = {
  ...HEDERA_ACCOUNT_1.operations[0],
  id: "mock-delegation-op",
  accountId: HEDERA_ACCOUNT_1.id,
};

describe("DelegationFlowModal [component]", () => {
  // Warm the bridge/family promise caches so React 19's `use()` doesn't suspend on first
  // render (no <Suspense> boundary in this test tree). Precedent: tezos/operationDetails.test.tsx.
  beforeAll(async () => {
    await warmHederaBridgeCaches(HEDERA_ACCOUNT_1);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockStatusErrors = {};
    mockBroadcast.mockResolvedValue(mockBroadcastedOperation);

    // Real `useHederaValidators` reads this preload-data observable via the public
    // `setHederaPreloadData` API (requires `pnpm build:libs`).
    setHederaPreloadData({ validators: [HEDERA_VALIDATOR_1] }, hederaCurrency);

    setUpModalsContainer();
  });

  afterEach(() => {
    tearDownModalsContainer();
  });

  const buildInitialState = () => ({
    accounts: [HEDERA_ACCOUNT_1],
    devices: { currentDevice: mockDevice, devices: [mockDevice] },
    modals: {
      MODAL_HEDERA_DELEGATION: {
        isOpened: true,
        data: { account: HEDERA_ACCOUNT_1 },
      },
    },
  });

  it("delegates to a validator: validator -> amount -> device -> success (happy path)", async () => {
    const { user } = render(<DelegationFlowModal />, {
      initialState: buildInitialState(),
    });

    // Real StepValidator + ValidatorsListField: pick the only available validator.
    // Click the row itself (`data-testid="modal-provider-row"`), not its title text -
    // the title has its own onClick (`stopPropagation` -> opens an external link) that
    // would otherwise swallow the click before it reaches the row's selection handler.
    const validatorRow = await screen.findByTestId("modal-provider-row");
    await user.click(validatorRow);

    const stakeContinueButton = await waitFor(() => {
      const btn = document.getElementById("stake-continue-button");
      expect(btn).not.toBeNull();
      expect(btn).not.toBeDisabled();
      return btn as HTMLElement;
    });
    await user.click(stakeContinueButton);

    const amountContinueButton = await waitFor(() => {
      const btn = document.getElementById("send-amount-continue-button");
      expect(btn).not.toBeNull();
      expect(btn).not.toBeDisabled();
      return btn as HTMLElement;
    });

    // Real AmountField/InputCurrency: verified (by reading InputCurrency.tsx and
    // shared/staking/AmountField.tsx) that this input is hardcoded `disabled` with
    // `onChange={noop}` and always mirrors `account.spendableBalance` - Hedera delegation
    // stakes the account's full spendable balance rather than a user-chosen amount, and no
    // bridge code path (createTransaction/updateTransaction/prepareTransaction) ever writes
    // a UI-typed value into `transaction.amount` for a Delegate transaction. So there is no
    // editable amount control to type into here; assert that real, verified behavior instead
    // of a nonexistent editable flow: the field is disabled and the underlying transaction
    // amount that reaches the signer stays exactly 0 (confirmed below via the device request
    // spy), which is the true "real" outcome of exercising this step.
    const amountInput = screen.getByRole("textbox");
    expect(amountInput).toBeDisabled();

    await user.click(amountContinueButton);

    const lastRequestBeforeSign = deviceActionRequestSpy.mock.lastCall?.[0] as {
      transaction: {
        family: string;
        mode: string;
        amount: { toString: () => string };
        properties?: { stakingNodeId?: number | null };
      };
    };

    // Item 1: assert the real transaction handed to the signer - delegate mode, hedera
    // family, and the exact selected validator's node id (0 is a valid id, so this must be
    // an exact match, not a truthiness check).
    expect(lastRequestBeforeSign.transaction).toEqual(
      expect.objectContaining({
        family: "hedera",
        mode: HEDERA_TRANSACTION_MODES.Delegate,
        properties: expect.objectContaining({
          stakingNodeId: HEDERA_VALIDATOR_1.nodeId,
        }),
      }),
    );

    // Item 2: the amount step's control is display-only (see comment above); the real
    // bridge never assigns it, so it stays exactly 0 all the way to the signer.
    expect(lastRequestBeforeSign.transaction.amount.toString()).toBe("0");

    const confirmButton = await screen.findByTestId("mock-device-confirm-success");
    await user.click(confirmButton);

    await waitFor(() => expect(mockBroadcast).toHaveBeenCalledWith({ id: "signed-op-1" }));

    expect(
      await screen.findByText("You have successfully delegated your assets"),
    ).toBeInTheDocument();
  });

  it("disables the amount step's continue button when the transaction status has errors", async () => {
    mockStatusErrors = { amount: new Error("amount required") };

    const { user } = render(<DelegationFlowModal />, {
      initialState: buildInitialState(),
    });

    const validatorRow = await screen.findByTestId("modal-provider-row");
    await user.click(validatorRow);

    const stakeContinueButton = await waitFor(() => {
      const btn = document.getElementById("stake-continue-button");
      expect(btn).not.toBeNull();
      expect(btn).not.toBeDisabled();
      return btn as HTMLElement;
    });
    await user.click(stakeContinueButton);

    const amountContinueButton = await waitFor(() => {
      const btn = document.getElementById("send-amount-continue-button");
      expect(btn).not.toBeNull();
      return btn as HTMLElement;
    });

    expect(amountContinueButton).toBeDisabled();
  });

  it("shows an error and never broadcasts when the device rejects the transaction", async () => {
    const { user } = render(<DelegationFlowModal />, {
      initialState: buildInitialState(),
    });

    const validatorRow = await screen.findByTestId("modal-provider-row");
    await user.click(validatorRow);

    const stakeContinueButton = await waitFor(() => {
      const btn = document.getElementById("stake-continue-button");
      expect(btn).not.toBeNull();
      expect(btn).not.toBeDisabled();
      return btn as HTMLElement;
    });
    await user.click(stakeContinueButton);

    const amountContinueButton = await waitFor(() => {
      const btn = document.getElementById("send-amount-continue-button");
      expect(btn).not.toBeNull();
      expect(btn).not.toBeDisabled();
      return btn as HTMLElement;
    });
    await user.click(amountContinueButton);

    const rejectButton = await screen.findByTestId("mock-device-confirm-error");
    await user.click(rejectButton);

    expect(await screen.findByText("device sign rejected")).toBeInTheDocument();
    expect(mockBroadcast).not.toHaveBeenCalled();

    // StepConfirmationFooter only renders a Retry button on the error branch.
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});
