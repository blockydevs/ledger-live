import React from "react";
import BigNumber from "bignumber.js";
import { render, screen } from "tests/testSetup";
import { getAccountBridge } from "@ledgerhq/live-common/bridge/index";
import { MAX_TRUST_LIMIT_VALUE } from "@ledgerhq/live-common/families/xrp/logicPublic";
import {
  XrpAccountNotActivated,
  XrpTrustLimitTooHigh,
  XrpTrustLimitZero,
  type Transaction,
} from "@ledgerhq/live-common/families/xrp/types";
import { XRP_ACCOUNT } from "../../__mocks__/account.mock";
import { makeStepProps } from "../../__mocks__/stepProps.mock";
import { makeStatus, optIn } from "../../__mocks__/transaction.mock";
import type { StepProps } from "../types";
import StepSettings from "./StepSettings";

const MAX_LIMIT_INFO_TEXT = "The maximum permitted trust limit is 9.99 × 1095.";
const RIPPLING_WARNING = /Turning this on allows other users' payments to move your balance/;

/** The transaction the step's first `onUpdateTransaction` call builds from `transaction` */
function applyFirstUpdate(props: StepProps, transaction: Transaction): Transaction {
  const [update] = jest.mocked(props.onUpdateTransaction).mock.calls[0];

  return update(transaction);
}

/** Matches the raised exponent of the protocol maximum sentence, for `screen.getByText` */
function isMaxLimitInfoExponent(_content: string, element: Element | null): boolean {
  return (
    element?.tagName === "SUP" &&
    !!element.parentElement?.textContent?.includes(MAX_LIMIT_INFO_TEXT)
  );
}

describe("StepSettings", () => {
  // The step suspends until its account bridge loads
  beforeAll(async () => {
    await getAccountBridge(XRP_ACCOUNT);
  });

  it("should show Maximum in a disabled input when the limit is the protocol maximum", () => {
    render(
      <StepSettings
        {...makeStepProps({ transaction: { ...optIn, amount: MAX_TRUST_LIMIT_VALUE } })}
      />,
    );

    expect(screen.getByDisplayValue("Maximum")).toBeDisabled();
    expect(screen.queryByTestId("xrp-trust-limit-input")).not.toBeInTheDocument();
  });

  it("should show the protocol maximum in the limit info", () => {
    render(<StepSettings {...makeStepProps()} />);

    expect(screen.getByText(isMaxLimitInfoExponent)).toBeVisible();
  });

  it("should reset the limit to 0 when the user turns Max off", async () => {
    const props = makeStepProps({ transaction: { ...optIn, amount: MAX_TRUST_LIMIT_VALUE } });
    const { user } = render(<StepSettings {...props} />);

    await user.click(screen.getByTestId("xrp-trust-limit-max-switch"));

    const amount = applyFirstUpdate(props, { ...optIn, amount: MAX_TRUST_LIMIT_VALUE }).amount;

    expect(props.onUpdateTransaction).toHaveBeenCalledTimes(1);
    expect(amount).toEqual(new BigNumber(0));
  });

  it("should set the protocol maximum when the user turns Max on", async () => {
    const props = makeStepProps();
    const { user } = render(<StepSettings {...props} />);

    await user.click(screen.getByTestId("xrp-trust-limit-max-switch"));

    const amount = applyFirstUpdate(props, optIn).amount;

    expect(props.onUpdateTransaction).toHaveBeenCalledTimes(1);
    expect(amount).toEqual(MAX_TRUST_LIMIT_VALUE);
  });

  it("should show a limit error while Max is on", () => {
    const error = new XrpAccountNotActivated("", { amount: "1.2 XRP" });
    const props = makeStepProps({
      transaction: { ...optIn, amount: MAX_TRUST_LIMIT_VALUE },
      status: makeStatus({ amount: error }),
    });

    render(<StepSettings {...props} />);

    expect(screen.getByText(/Activate your XRP account first/)).toBeVisible();
  });

  it("should hide the zero limit error when the user has not typed a limit", () => {
    render(
      <StepSettings
        {...makeStepProps({ status: makeStatus({ amount: new XrpTrustLimitZero() }) })}
      />,
    );

    expect(screen.queryByText(/The limit must be above 0/)).not.toBeInTheDocument();
  });

  it("should show the zero limit error once the user types a limit", async () => {
    const props = makeStepProps({ status: makeStatus({ amount: new XrpTrustLimitZero() }) });
    const { user } = render(<StepSettings {...props} />);

    await user.type(screen.getByRole("textbox"), "5");

    expect(screen.getByText(/The limit must be above 0/)).toBeVisible();
  });

  it("should show a limit above the maximum as an error", () => {
    render(
      <StepSettings
        {...makeStepProps({ status: makeStatus({ amount: new XrpTrustLimitTooHigh() }) })}
      />,
    );

    expect(screen.getByText(/Trust limit is above the maximum/)).toBeVisible();
  });

  it("should turn rippling on when the user clicks the rippling switch", async () => {
    const props = makeStepProps();
    const { user } = render(<StepSettings {...props} />);

    await user.click(screen.getByTestId("xrp-rippling-switch"));

    expect(props.onChangeRippling).toHaveBeenCalledTimes(1);
    expect(props.onChangeRippling).toHaveBeenCalledWith(true);
  });

  it("should turn rippling off when the user clicks the rippling switch again", async () => {
    const props = makeStepProps({ isRippling: true });
    const { user } = render(<StepSettings {...props} />);

    await user.click(screen.getByTestId("xrp-rippling-switch"));

    expect(props.onChangeRippling).toHaveBeenCalledTimes(1);
    expect(props.onChangeRippling).toHaveBeenCalledWith(false);
  });

  it("should warn about rippling while rippling is on", () => {
    render(<StepSettings {...makeStepProps({ isRippling: true })} />);

    expect(screen.getByText(RIPPLING_WARNING)).toBeVisible();
  });

  it("should leave the rippling warning out while rippling is off", () => {
    render(<StepSettings {...makeStepProps()} />);

    expect(screen.queryByText(RIPPLING_WARNING)).not.toBeInTheDocument();
  });

  it("should show a transaction preparation error", () => {
    render(<StepSettings {...makeStepProps({ error: new Error("prepare failed") })} />);

    expect(screen.getByText(/prepare failed/)).toBeVisible();
  });
});
