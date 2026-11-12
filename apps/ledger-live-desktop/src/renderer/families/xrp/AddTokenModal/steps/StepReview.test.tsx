import React from "react";
import { render, screen } from "tests/testSetup";
import { HttpResponse, http, server } from "tests/server";
import { MAX_TRUST_LIMIT_VALUE } from "@ledgerhq/live-common/families/xrp/logicPublic";
import { makeStepProps } from "../../__mocks__/stepProps.mock";
import { xrpMptToken } from "../../__mocks__/currency.mock";
import { optIn } from "../../__mocks__/transaction.mock";
import StepReview from "./StepReview";

const XRPL_TESTNET_NODE = "https://s.altnet.rippletest.net:51234";

const endpoints = { node: jest.fn<Response, [{ request: Request }]>() };

function mockTransferRate(transferRate?: number) {
  endpoints.node.mockImplementation(() => {
    const node = {
      LedgerEntryType: "AccountRoot",
      Flags: 0,
      TransferRate: transferRate,
    };

    return HttpResponse.json({ result: { node, account_data: node, status: "success" } });
  });
}

describe("StepReview", () => {
  beforeEach(() => {
    endpoints.node.mockReset();
    mockTransferRate();
    server.use(http.post(XRPL_TESTNET_NODE, endpoints.node));
  });

  it("should show the issuer fee as a percentage", async () => {
    mockTransferRate(1_005_000_000);

    render(<StepReview {...makeStepProps()} />);

    expect(await screen.findByText("0.5%")).toBeVisible();
    expect(screen.getByText("Issuer fee")).toBeVisible();
  });

  it("should show a limit at the protocol maximum in scientific notation", async () => {
    render(
      <StepReview
        {...makeStepProps({ transaction: { ...optIn, amount: MAX_TRUST_LIMIT_VALUE } })}
      />,
    );

    expect(await screen.findByText(/^9\.99e95 /)).toBeVisible();
  });

  it("should show a limit above 16 integer digits in scientific notation", async () => {
    render(
      <StepReview
        {...makeStepProps({
          transaction: { ...optIn, amount: MAX_TRUST_LIMIT_VALUE.shiftedBy(-1) },
        })}
      />,
    );

    expect(await screen.findByText(/^9\.999999999999999e94 /)).toBeVisible();
  });

  it("should say in the tooltip that a maximum trust limit is the maximum", async () => {
    const props = makeStepProps({ transaction: { ...optIn, amount: MAX_TRUST_LIMIT_VALUE } });
    const { user } = render(<StepReview {...props} />);

    await user.hover(screen.getByText("Trust limit"));

    expect(await screen.findByText(/This is the maximum permitted trust limit\./)).toBeVisible();
  });

  it("should leave the maximum sentence out of the tooltip of a lower trust limit", async () => {
    const { user } = render(<StepReview {...makeStepProps()} />);

    await user.hover(screen.getByText("Trust limit"));

    expect(await screen.findByText(/The most of this token your account accepts/)).toBeVisible();
    expect(screen.queryByText(/maximum permitted trust limit/)).not.toBeInTheDocument();
  });

  it("should show no limit or rippling for an MPT", () => {
    render(<StepReview {...makeStepProps({ token: xrpMptToken })} />);

    expect(screen.getByText("Test MPT (TMPT)")).toBeVisible();
    expect(screen.queryByText("Trust limit")).not.toBeInTheDocument();
    expect(screen.queryByText("Rippling")).not.toBeInTheDocument();
  });
});
