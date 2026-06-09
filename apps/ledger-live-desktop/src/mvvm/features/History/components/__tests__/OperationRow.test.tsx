import React from "react";
import BigNumber from "bignumber.js";
import { fireEvent, render, screen } from "tests/testSetup";
import { getCryptoCurrencyById } from "@ledgerhq/live-common/currencies/index";
import type { Operation } from "@ledgerhq/types-live";
import type { Currency } from "@ledgerhq/types-cryptoassets";
import { OperationRow } from "../OperationRow";
import type { OperationRow as OperationRowType, OperationTableItem } from "../../types";

jest.mock("@features/platform-feature-flags", () => ({
  useWalletFeaturesConfig: () => ({ shouldDisplayAggregatedAssets: false }),
}));
jest.mock("LLD/components/TransactionalIcon", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("LLD/components/SquaredCryptoIcon", () => ({
  SquaredCryptoIcon: () => null,
}));
jest.mock("LLD/components/Cells/BalanceCell", () => ({
  BalanceCell: () => null,
}));
jest.mock("LLD/components/Cells/CounterValueCell", () => ({
  CounterValueCell: () => null,
}));
jest.mock("../OperationCounterpartyLabel", () => ({
  OperationCounterpartyLabel: () => null,
}));

const tezosCurrency = getCryptoCurrencyById("tezos");
const bitcoinCurrency = getCryptoCurrencyById("bitcoin");
const tokenCurrency = {
  type: "TokenCurrency",
  id: "ethereum/erc20/usd__coin",
  ticker: "USDC",
  parentCurrency: getCryptoCurrencyById("ethereum"),
} as unknown as Currency;

const makeOperation = (overrides: Partial<Operation> = {}): Operation =>
  ({
    id: "op-1",
    type: "UNSTAKE",
    hasFailed: false,
    date: new Date("2026-01-01T10:00:00Z"),
    ...overrides,
  }) as Operation;

const makeRow = (overrides: Partial<OperationTableItem> = {}): OperationRowType =>
  ({
    original: {
      id: "item-1",
      operation: makeOperation(),
      account: {} as OperationTableItem["account"],
      date: new Date("2026-01-01T10:00:00Z"),
      type: "OUT",
      address: "",
      amount: new BigNumber(100),
      currency: tezosCurrency,
      isPending: false,
      isUnread: false,
      ...overrides,
    },
  }) as unknown as OperationRowType;

const renderRow = (row: OperationRowType, onRowClick = jest.fn()) => {
  render(
    <table>
      <tbody>
        <OperationRow row={row} onRowClick={onRowClick} />
      </tbody>
    </table>,
  );
  return onRowClick;
};

describe("History/OperationRow", () => {
  it("uses the family-scoped label for a coin currency with an override", () => {
    renderRow(makeRow());
    expect(screen.getByText("Unstaking")).toBeInTheDocument();
  });

  it("resolves the family from the parent currency for token operations", () => {
    renderRow(
      makeRow({
        currency: tokenCurrency,
        type: "IN",
        address: "0xabc",
        operation: makeOperation({ type: "IN" }),
      }),
    );
    expect(screen.getByText("Received")).toBeInTheDocument();
  });

  it("shows the failed label for failed operations", () => {
    renderRow(
      makeRow({
        currency: bitcoinCurrency,
        operation: makeOperation({ type: "OUT", hasFailed: true }),
      }),
    );
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("forwards row clicks", () => {
    const row = makeRow();
    const onRowClick = renderRow(row);
    fireEvent.click(screen.getByTestId("history-operation-row-op-1"));
    expect(onRowClick).toHaveBeenCalledWith(row);
  });
});
