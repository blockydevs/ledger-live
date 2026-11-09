import React from "react";
import invariant from "invariant";
import { BigNumber } from "bignumber.js";
import { render } from "tests/testSetup";
import { genAccount, genTokenAccount } from "@ledgerhq/ledger-wallet-framework/mocks/account";
import { getCryptoCurrencyById } from "@domain/entity-currency-crypto";
import { XRP_DEV_TOKENS } from "@ledgerhq/live-common/families/xrp/devTokens";
import type {
  Transaction,
  TransactionStatus,
  XrpTokenAccount,
} from "@ledgerhq/live-common/families/xrp/types";
import useBridgeTransaction from "@ledgerhq/live-common/bridge/useBridgeTransaction";
import type { TokenAction } from "./types";
import Body from "./Body";

jest.mock("@ledgerhq/live-common/bridge/useAccountBridge", () => {
  const jsHelpers = jest.requireActual("@ledgerhq/ledger-wallet-framework/bridge/jsHelpers");

  return {
    useAccountBridge: () => {
      return {
        updateTransaction: jsHelpers.updateTransaction,
        createTransaction: () => ({ family: "xrp", amount: new BigNumber(0), recipient: "" }),
      };
    },
  };
});
jest.mock("@ledgerhq/live-common/bridge/useBridgeTransaction");
jest.mock("@ledgerhq/live-common/bridge/react/index", () => {
  return { __esModule: true, SyncSkipUnderPriority: () => null };
});
jest.mock("@shared/analytics-react", () => {
  return { ...jest.requireActual("@shared/analytics-react"), Track: () => null };
});

const stepperTransaction = jest.fn<void, [Transaction]>();

jest.mock("~/renderer/components/Stepper", () => {
  return {
    __esModule: true,
    default: ({ transaction }: { transaction: Transaction }) => {
      stepperTransaction(transaction);

      return null;
    },
  };
});

const token = XRP_DEV_TOKENS[0];
const limit = new BigNumber(1000).shiftedBy(38);
const account = genAccount("xrp-add-token-body", {
  currency: getCryptoCurrencyById("ripple_testnet"),
});

const status: TransactionStatus = {
  errors: {},
  warnings: {},
  estimatedFees: new BigNumber(0),
  amount: new BigNumber(0),
  totalSpent: new BigNumber(0),
};

function makeTokenAccount(isRippling?: boolean): XrpTokenAccount {
  return {
    ...genTokenAccount(0, account, token),
    xrpResources: { limit, isRippling, isLocked: false },
  };
}

function renderBody(tokenAccount?: XrpTokenAccount, action?: Exclude<TokenAction, "add">) {
  render(
    <Body
      stepId="token"
      onClose={jest.fn()}
      onChangeStepId={jest.fn()}
      params={{ account, tokenAccount, action }}
    />,
  );

  expect(stepperTransaction).toHaveBeenCalledTimes(1);

  return stepperTransaction.mock.calls[0][0];
}

describe("AddTokenModal Body", () => {
  beforeEach(() => {
    stepperTransaction.mockClear();

    jest.mocked(useBridgeTransaction).mockImplementation((_bridge, init) => {
      invariant(init, "Body builds its transaction in useBridgeTransaction");

      return {
        account,
        status,
        transaction: init().transaction,
        setTransaction: jest.fn(),
        updateTransaction: jest.fn(),
        parentAccount: undefined,
        setAccount: jest.fn(),
        updateAccount: jest.fn(),
        bridgeError: null,
        bridgePending: false,
      };
    });
  });

  it("should keep rippling on when the user edits a line with rippling on", () => {
    expect(renderBody(makeTokenAccount(true), "edit")).toEqual(
      expect.objectContaining({ mode: "changeTrust", amount: limit, noRipple: false }),
    );
  });

  it.each([false, undefined])(
    "should keep rippling off when the user edits a line with isRippling %s",
    isRippling => {
      expect(renderBody(makeTokenAccount(isRippling), "edit")).toEqual(
        expect.objectContaining({ mode: "changeTrust", amount: limit, noRipple: true }),
      );
    },
  );

  it("should leave the rippling choice out when the user adds a token", () => {
    expect(renderBody()).not.toHaveProperty("noRipple");
  });

  it("should leave the rippling choice out when the user removes a token", () => {
    expect(renderBody(makeTokenAccount(true), "remove")).toEqual(
      expect.not.objectContaining({ noRipple: expect.anything() }),
    );
  });
});
