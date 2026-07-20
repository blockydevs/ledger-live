import React from "react";
import type { TokenCurrency } from "@ledgerhq/types-cryptoassets";
import { HEDERA_TRANSACTION_MODES } from "@ledgerhq/live-common/families/hedera/constants";
import { render, screen, waitFor } from "tests/testSetup";
import {
  deviceActionRequestSpy,
  mockDevice,
  setUpModalsContainer,
  tearDownModalsContainer,
  warmBridgeCaches,
} from "../../__mocks__/modalTestSetup.mock";
import { HEDERA_ACCOUNT_1 } from "../../__mocks__/account.mock";
import { HederaCustomModal } from "../../constants";
import ReceiveWithAssociationModal from "../index";

// Desktop has no MOCK bridge for hedera; stub the transaction/status source so the step machine,
// isAssociationFlow and the broadcast flow stay real.
jest.mock("@ledgerhq/live-common/bridge/useBridgeTransaction", () =>
  require("../../__mocks__/modalTestSetup.mock").createBridgeTransactionMock({
    withAccountUpdates: true,
  }),
);

// CAL-backed token list would otherwise hit the network; resolve it immediately so StepAccount
// mounts past its loading state (the picked token comes from the mocked SelectCurrency below).
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

// SelectCurrency wraps react-select + a virtualized list, unusable in jsdom; swap it for a plain
// button reporting the same `onChange` contract with this HTS token that requires association.
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

function expectLastSignerRequestToAssociateMockHtsToken() {
  const request = deviceActionRequestSpy.mock.lastCall?.[0];

  expect(request.transaction).toEqual(
    expect.objectContaining({
      family: "hedera",
      mode: HEDERA_TRANSACTION_MODES.TokenAssociate,
      assetReference: mockHtsToken.contractAddress,
    }),
  );
  expect(request.tokenCurrency).toMatchObject({ id: mockHtsToken.id });
}

describe("ReceiveWithAssociationModal [component]", () => {
  beforeAll(async () => {
    await warmBridgeCaches(HEDERA_ACCOUNT_1);
  });

  beforeEach(() => {
    jest.clearAllMocks();

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

    await user.click(await screen.findByTestId("mock-select-token"));

    const continueButton = await screen.findByTestId("modal-continue-button");
    await waitFor(() => expect(continueButton).toBeEnabled());
    await user.click(continueButton);

    // isAssociationFlow routes to the "associationDevice" step, not the plain "device" step.
    const confirmButton = await screen.findByTestId("mock-device-confirm-success");

    expectLastSignerRequestToAssociateMockHtsToken();

    await user.click(confirmButton);

    expect(await screen.findByText("Transaction sent")).toBeVisible();
    expect(
      screen.getByText(
        "You will be able to receive this token once the Associate Token transaction has been confirmed",
      ),
    ).toBeVisible();
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

    expectLastSignerRequestToAssociateMockHtsToken();

    await user.click(rejectButton);

    expect(await screen.findByText("device sign rejected")).toBeVisible();

    // The success copy only renders on the broadcast branch.
    expect(screen.queryByText("Transaction sent")).not.toBeInTheDocument();

    // StepAssociationConfirmationFooter only renders a Retry button on the error branch.
    expect(screen.getByRole("button", { name: /retry/i })).toBeVisible();
  });
});
