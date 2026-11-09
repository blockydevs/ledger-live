import React from "react";
import invariant from "invariant";
import { BigNumber } from "bignumber.js";
import { render, screen, within } from "tests/testSetup";
import { HttpResponse, http, server } from "tests/server";
import { genAccount } from "@ledgerhq/ledger-wallet-framework/mocks/account";
import { getCryptoCurrencyById } from "@domain/entity-currency-crypto";
import { XRP_DEV_TOKENS } from "@ledgerhq/live-common/families/xrp/devTokens";
import {
  Transaction,
  TransactionStatus,
  XrpTrustLimitTooHigh,
  XrpTrustLimitZero,
} from "@ledgerhq/live-common/families/xrp/types";
import { t } from "~/renderer/i18n/init";
import { StepProps } from "../types";
import StepToken from "./StepToken";

jest.mock("@ledgerhq/live-common/bridge/useAccountBridge", () => {
  const jsHelpers = jest.requireActual("@ledgerhq/ledger-wallet-framework/bridge/jsHelpers");

  return { useAccountBridge: () => ({ updateTransaction: jsHelpers.updateTransaction }) };
});

const XRPL_TESTNET_NODE = "https://s.altnet.rippletest.net:51234";

const token = XRP_DEV_TOKENS[0];

const account = genAccount("xrp-step-token", {
  currency: getCryptoCurrencyById("ripple_testnet"),
});

const optIn: Transaction = {
  family: "xrp",
  mode: "changeTrust",
  assetReference: token.tokenIdentifier,
  assetOwner: token.contractAddress,
  amount: new BigNumber(0),
  recipient: "",
  fees: null,
  networkInfo: null,
  tag: null,
};

const PROTOCOL_MAX = new BigNumber("9999999999999999e80").shiftedBy(38);

const status: TransactionStatus = {
  errors: {},
  warnings: {},
  estimatedFees: new BigNumber(0),
  amount: new BigNumber(0),
  totalSpent: new BigNumber(0),
};

const endpoints = { node: jest.fn<Response, [{ request: Request }]>() };

function renderStep({
  error,
  transaction = optIn,
}: {
  error?: Error;
  transaction?: Transaction;
} = {}) {
  const props: StepProps = {
    t,
    account,
    error,
    transaction,
    status,
    transitionTo: jest.fn(),
    device: null,
    parentAccount: null,
    onRetry: jest.fn(),
    onClose: jest.fn(),
    openModal: jest.fn(),
    optimisticOperation: undefined,
    warning: undefined,
    signed: false,
    onChangeTransaction: jest.fn(),
    onUpdateTransaction: jest.fn(),
    onTransactionError: jest.fn(),
    onOperationBroadcasted: jest.fn(),
    setSigned: jest.fn(),
    bridgePending: false,
    action: "add",
    tokenAccount: undefined,
  };

  return { ...render(<StepToken {...props} />), props };
}

function getRipplingCheckbox() {
  const ripplingSwitch = within(screen.getByTestId("xrp-rippling-switch"));

  return ripplingSwitch.getByRole("checkbox", { hidden: true });
}

function getRipplingSwitchButton() {
  const switchButton = screen.getByTestId("xrp-rippling-switch").firstElementChild;
  invariant(switchButton instanceof HTMLElement, "the rippling switch renders a button");

  return switchButton;
}

function applyUpdate(props: StepProps, transaction: Transaction): Transaction {
  const [update] = jest.mocked(props.onUpdateTransaction).mock.calls[0];

  return update(transaction);
}

describe("StepToken", () => {
  beforeEach(() => {
    endpoints.node.mockReset().mockImplementation(() => {
      return HttpResponse.json({ result: { account_data: {}, status: "success" } });
    });

    server.use(http.post(XRPL_TESTNET_NODE, endpoints.node));
  });

  it("should hide the zero limit error when the user has not typed a limit", async () => {
    renderStep({ error: new XrpTrustLimitZero() });

    expect(await screen.findByText("0%")).toBeVisible();
    expect(screen.queryByText("Enter a trust limit above 0")).not.toBeInTheDocument();
  });

  it("should show the zero limit error when the user types a limit", async () => {
    const { user } = renderStep({ error: new XrpTrustLimitZero() });
    expect(await screen.findByText("0%")).toBeVisible();

    await user.type(screen.getByRole("textbox"), "0");

    expect(screen.getByText("Enter a trust limit above 0")).toBeVisible();
  });

  it("should show another limit error when the user has not typed a limit", async () => {
    renderStep({ error: new XrpTrustLimitTooHigh() });

    expect(await screen.findByText("0%")).toBeVisible();
    expect(screen.getByText("Trust limit is above the maximum")).toBeVisible();
  });

  it("should show Maximum instead of the limit input when the limit is the protocol maximum", async () => {
    renderStep({ transaction: { ...optIn, amount: PROTOCOL_MAX } });

    expect(await screen.findByText("0%")).toBeVisible();
    expect(screen.getByText("Maximum")).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("should reset the limit to 0 when the user picks a custom limit", async () => {
    const { user, props } = renderStep({ transaction: { ...optIn, amount: PROTOCOL_MAX } });
    expect(await screen.findByText("0%")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Set a custom limit" }));

    expect(props.onUpdateTransaction).toHaveBeenCalledTimes(1);
    expect(applyUpdate(props, { ...optIn, amount: PROTOCOL_MAX }).amount).toEqual(new BigNumber(0));
  });

  it("should allow rippling when the user turns the switch on", async () => {
    const { user, props } = renderStep();
    expect(await screen.findByText("0%")).toBeVisible();
    expect(getRipplingCheckbox()).not.toBeChecked();

    await user.click(getRipplingSwitchButton());

    expect(props.onUpdateTransaction).toHaveBeenCalledTimes(1);
    expect(applyUpdate(props, optIn)).toEqual({ ...optIn, noRipple: false });
  });

  it("should block rippling when the user turns the switch off", async () => {
    const ripplingOptIn = { ...optIn, noRipple: false };
    const { user, props } = renderStep({ transaction: ripplingOptIn });
    expect(await screen.findByText("0%")).toBeVisible();
    expect(getRipplingCheckbox()).toBeChecked();
    expect(screen.getByText(/With rippling on/)).toBeVisible();

    await user.click(getRipplingSwitchButton());

    expect(props.onUpdateTransaction).toHaveBeenCalledTimes(1);
    expect(applyUpdate(props, ripplingOptIn)).toEqual({ ...optIn, noRipple: true });
  });
});
