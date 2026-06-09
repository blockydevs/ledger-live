import React from "react";
import BigNumber from "bignumber.js";
import { act, render, screen } from "tests/testSetup";
import { genAccount } from "@ledgerhq/ledger-wallet-framework/mocks/account";
import {
  getCryptoCurrencyById,
  setSupportedCurrencies,
} from "@ledgerhq/live-common/currencies/index";
import type { Operation } from "@ledgerhq/types-live";
import type { TezosAccount } from "@ledgerhq/live-common/families/tezos/types";
import { OperationDetails } from "~/renderer/drawers/OperationDetails";
import { AFTER_ONBOARDING_STATE } from "~/renderer/reducers/settings";

setSupportedCurrencies(["tezos"]);
const currency = getCryptoCurrencyById("tezos");

const makeOperation = (accountId: string, type: Operation["type"]): Operation =>
  ({
    id: `${accountId}-${type}`,
    hash: "opHash",
    type,
    value: new BigNumber(2_000_000),
    fee: new BigNumber(300),
    senders: ["tz1sender"],
    recipients: ["tz1recipient"],
    blockHash: "blockHash",
    blockHeight: 100,
    accountId,
    date: new Date("2026-01-01T10:00:00Z"),
    extra: {},
  }) as Operation;

const makeAccount = (operation: (accountId: string) => Operation): TezosAccount => {
  const account = { ...genAccount("tezos-opdetails", { currency }) } as TezosAccount;
  account.operations = [operation(account.id)];
  account.pendingOperations = [];
  return account;
};

const renderDrawer = (account: TezosAccount) =>
  render(<OperationDetails operationId={account.operations[0].id} accountId={account.id} />, {
    initialState: {
      accounts: [account],
      settings: AFTER_ONBOARDING_STATE,
    },
  });

describe("Tezos OperationDetails drawer", () => {
  // The first OperationDetails mount in a fresh jest module registry never paints (a one-shot
  // module-level async init keeps it suspended); mount and discard until a mount paints so the
  // real tests below render deterministically.
  beforeAll(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const account = makeAccount(id => makeOperation(id, "OUT"));
      const r = renderDrawer(account);
      await act(async () => {
        await new Promise(res => setTimeout(res, 1000));
      });
      const painted = r.container.innerHTML.length > 0;
      r.unmount();
      if (painted) return;
    }
  }, 30000);

  it("shows the tezos-scoped label for an UNSTAKE operation", async () => {
    const account = makeAccount(id => makeOperation(id, "UNSTAKE"));
    renderDrawer(account);
    expect(await screen.findByTestId("transaction-type")).toHaveTextContent("Unstaking");
    expect(screen.getByTestId("operation-type")).toHaveTextContent("Unstaking");
  });

  it("shows the tezos-scoped label for a FINALIZE_UNSTAKE operation", async () => {
    const account = makeAccount(id => makeOperation(id, "FINALIZE_UNSTAKE"));
    renderDrawer(account);
    expect(await screen.findByTestId("transaction-type")).toHaveTextContent("Unstaked");
    expect(screen.getByTestId("operation-type")).toHaveTextContent("Unstaked");
  });
});
