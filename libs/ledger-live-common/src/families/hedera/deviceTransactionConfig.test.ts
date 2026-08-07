import BigNumber from "bignumber.js";
import type { Account, AccountLike } from "@ledgerhq/types-live";
import { HEDERA_TRANSACTION_MODES } from "@ledgerhq/coin-hedera/constants";
import getDeviceTransactionConfig from "./deviceTransactionConfig";
import type { Transaction, TransactionStatus } from "./types";

describe("getDeviceTransactionConfig", () => {
  const account = {} as AccountLike;
  const parentAccount = null as Account | null;

  const genericTx: Transaction = {
    family: "hedera",
    mode: HEDERA_TRANSACTION_MODES.Send,
    amount: new BigNumber(0),
    recipient: "0.0.1234",
    useAllAmount: false,
    fees: null,
    memoType: null,
    memoValue: null,
  };

  const createStatus = (estimatedFees: BigNumber): TransactionStatus => ({
    errors: {},
    warnings: {},
    estimatedFees,
    amount: new BigNumber(0),
    totalSpent: new BigNumber(0),
  });

  it("renders a memo row from memoValue on a transfer", async () => {
    const fields = await getDeviceTransactionConfig({
      account,
      parentAccount,
      transaction: { ...genericTx, memoValue: "hello", memoType: "text" },
      status: createStatus(new BigNumber(0)),
    });

    expect(fields).toContainEqual(expect.objectContaining({ label: "Memo", value: "hello" }));
  });

  it("renders a memo row from memoValue on a staking transaction", async () => {
    const fields = await getDeviceTransactionConfig({
      account,
      parentAccount,
      transaction: {
        ...genericTx,
        mode: HEDERA_TRANSACTION_MODES.ClaimRewards,
        memoValue: "Claiming rewards",
      },
      status: createStatus(new BigNumber(100000)),
    });

    expect(fields).toContainEqual(
      expect.objectContaining({ label: "Memo", value: "Claiming rewards" }),
    );
  });

  it("renders a staked node id row from valId on a delegate transaction", async () => {
    const fields = await getDeviceTransactionConfig({
      account,
      parentAccount,
      transaction: { ...genericTx, mode: HEDERA_TRANSACTION_MODES.Delegate, valId: "7" },
      status: createStatus(new BigNumber(100000)),
    });

    expect(fields).toContainEqual(
      expect.objectContaining({ label: "Staked Node ID", value: "7" }),
    );
  });

  it("renders a gas limit row from gasLimit on a send transaction", async () => {
    const fields = await getDeviceTransactionConfig({
      account,
      parentAccount,
      transaction: { ...genericTx, gasLimit: new BigNumber(21000) },
      status: createStatus(new BigNumber(0)),
    });

    expect(fields).toContainEqual(
      expect.objectContaining({ label: "Gas Limit", value: "21000" }),
    );
  });

  it("does not render a memo row when memoValue is absent", async () => {
    const fields = await getDeviceTransactionConfig({
      account,
      parentAccount,
      transaction: genericTx,
      status: createStatus(new BigNumber(0)),
    });

    expect(fields.some(field => field.label === "Memo")).toBe(false);
  });
});
