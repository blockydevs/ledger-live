import React from "react";
import { setHederaPreloadData } from "@ledgerhq/live-common/families/hedera/react";
import { HEDERA_TRANSACTION_MODES } from "@ledgerhq/live-common/families/hedera/constants";
import { render, screen, waitFor } from "tests/testSetup";
import {
  deviceActionRequestSpy,
  mockDevice,
  setUpModalsContainer,
  tearDownModalsContainer,
  warmBridgeCaches,
} from "../../__mocks__/modalTestSetup.mock";
import { hederaCurrency } from "../../__mocks__/currency.mock";
import { HEDERA_ACCOUNT_1 } from "../../__mocks__/account.mock";
import { HEDERA_VALIDATOR_1 } from "../../__mocks__/validator.mock";
import DelegationFlowModal from "../index";

// "mock" prefix required: hoisted jest.mock factories may only close over variables named so.
let mockStatusErrors: Record<string, Error> = {};

// Stub only the transaction/status source; the step machine and the real bridge
// `updateTransaction` stay in the loop.
jest.mock("@ledgerhq/live-common/bridge/useBridgeTransaction", () =>
  require("../../__mocks__/modalTestSetup.mock").createBridgeTransactionMock({
    getStatusErrors: () => mockStatusErrors,
  }),
);

// Stub only the device widget, keep everything downstream of `onResult` real.
jest.mock(
  "~/renderer/components/DeviceAction",
  () => require("../../__mocks__/modalTestSetup.mock").deviceActionModuleMock,
);

// gRPC broadcast can't be intercepted by MSW; stub it so no real mainnet write fires.
jest.mock(
  "@ledgerhq/live-common/hooks/useBroadcast",
  () => require("../../__mocks__/modalTestSetup.mock").broadcastModuleMock,
);

// The step footers expose ids rather than test ids, so they are not reachable through `screen`.
const findStepButton = (id: string) =>
  waitFor(() => {
    const button = document.getElementById(id);
    expect(button).toBeInstanceOf(HTMLButtonElement);
    return button as HTMLButtonElement;
  });

const findEnabledStepButton = async (id: string) => {
  const button = await findStepButton(id);
  await waitFor(() => expect(button).toBeEnabled());
  return button;
};

describe("DelegationFlowModal [component]", () => {
  beforeAll(async () => {
    await warmBridgeCaches(HEDERA_ACCOUNT_1);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockStatusErrors = {};
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

  it("delegates to a validator: validator -> amount -> device -> success", async () => {
    const { user } = render(<DelegationFlowModal />, {
      initialState: buildInitialState(),
    });

    // Click the row, not its title (the title's onClick opens an external link and stops propagation).
    const validatorRow = await screen.findByTestId("modal-provider-row");
    await user.click(validatorRow);

    await user.click(await findEnabledStepButton("stake-continue-button"));

    const amountContinueButton = await findEnabledStepButton("send-amount-continue-button");

    // Hedera stakes the full spendable balance, so the amount field is display-only.
    expect(screen.getByRole("textbox")).toBeDisabled();

    await user.click(amountContinueButton);

    const lastRequestBeforeSign = deviceActionRequestSpy.mock.lastCall?.[0] as {
      transaction: {
        family: string;
        mode: string;
        amount: { toString: () => string };
        properties?: { stakingNodeId?: number | null };
      };
    };

    expect(lastRequestBeforeSign.transaction).toEqual(
      expect.objectContaining({
        family: "hedera",
        mode: HEDERA_TRANSACTION_MODES.Delegate,
        properties: expect.objectContaining({
          stakingNodeId: HEDERA_VALIDATOR_1.nodeId,
        }),
      }),
    );
    expect(lastRequestBeforeSign.transaction.amount.toString()).toBe("0");

    const confirmButton = await screen.findByTestId("mock-device-confirm-success");
    await user.click(confirmButton);

    expect(await screen.findByText("You have successfully delegated your assets")).toBeVisible();
  });

  it("disables the amount step's continue button when the transaction status has errors", async () => {
    mockStatusErrors = { amount: new Error("amount required") };

    const { user } = render(<DelegationFlowModal />, {
      initialState: buildInitialState(),
    });

    const validatorRow = await screen.findByTestId("modal-provider-row");
    await user.click(validatorRow);

    await user.click(await findEnabledStepButton("stake-continue-button"));

    expect(await findStepButton("send-amount-continue-button")).toBeDisabled();
  });

  it("shows an error and never broadcasts when the device rejects the transaction", async () => {
    const { user } = render(<DelegationFlowModal />, {
      initialState: buildInitialState(),
    });

    const validatorRow = await screen.findByTestId("modal-provider-row");
    await user.click(validatorRow);

    await user.click(await findEnabledStepButton("stake-continue-button"));
    await user.click(await findEnabledStepButton("send-amount-continue-button"));

    const rejectButton = await screen.findByTestId("mock-device-confirm-error");
    await user.click(rejectButton);

    expect(await screen.findByText("device sign rejected")).toBeVisible();

    expect(
      screen.queryByText("You have successfully delegated your assets"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeVisible();
  });
});
