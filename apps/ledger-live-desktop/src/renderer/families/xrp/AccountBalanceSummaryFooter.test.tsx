import React from "react";
import { BigNumber } from "bignumber.js";
import { render, screen } from "tests/testSetup";
import { genAccount, genTokenAccount } from "@ledgerhq/ledger-wallet-framework/mocks/account";
import { getCryptoCurrencyById } from "@domain/entity-currency-crypto";
import { XRP_DEV_TOKENS } from "@ledgerhq/live-common/families/xrp/devTokens";
import type { XrpTokenAccount } from "@ledgerhq/live-common/families/xrp/types";
import AccountBalanceSummaryFooter from "./AccountBalanceSummaryFooter";

const PROTOCOL_MAX = new BigNumber("9999999999999999e80").shiftedBy(38);

const account = genAccount("xrp-balance-footer", {
  currency: getCryptoCurrencyById("ripple_testnet"),
});

function makeTokenAccount(limit: BigNumber): XrpTokenAccount {
  return {
    ...genTokenAccount(0, account, XRP_DEV_TOKENS[0]),
    xrpResources: { limit, isLocked: false },
  };
}

describe("AccountBalanceSummaryFooter", () => {
  it("should show Maximum when the trust limit is the protocol maximum", () => {
    render(<AccountBalanceSummaryFooter account={makeTokenAccount(PROTOCOL_MAX)} />);

    expect(screen.getByText("Maximum")).toBeVisible();
  });

  it("should show the amount when the trust limit is below the protocol maximum", () => {
    render(<AccountBalanceSummaryFooter account={makeTokenAccount(PROTOCOL_MAX.minus(1))} />);

    expect(screen.getByText("Trust limit")).toBeVisible();
    expect(screen.queryByText("Maximum")).not.toBeInTheDocument();
  });
});
