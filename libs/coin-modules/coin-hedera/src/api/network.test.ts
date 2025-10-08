import BigNumber from "bignumber.js";
import { TransferTransaction } from "@hashgraph/sdk";
import { buildUnsignedTransaction } from "./network";
import { Transaction } from "../types";
import invariant from "invariant";
import { HEDERA_TRANSACTION_MODES } from "../constants";
import { getMockedAccount } from "../test/fixtures/account.fixture";

describe("buildUnsignedTransaction", () => {
  const mockAccount = getMockedAccount();

  test("builds basic transaction without maxFee", async () => {
    const transaction: Transaction = {
      mode: HEDERA_TRANSACTION_MODES.Send,
      family: "hedera",
      amount: new BigNumber(100),
      recipient: "0.0.456",
      memo: "test memo",
    };

    const result = await buildUnsignedTransaction({ account: mockAccount, transaction });

    expect(result).toBeInstanceOf(TransferTransaction);
    invariant(result instanceof TransferTransaction, "hedera: TransferTransaction type guard");
    expect(result.transactionMemo).toBe("test memo");
    expect(result.isFrozen()).toBe(true);
    expect(result.hbarTransfers.size).toBe(2);

    const senderTransfer = result.hbarTransfers.get("0.0.123");
    const recipientTransfer = result.hbarTransfers.get("0.0.456");

    expect(senderTransfer?.toTinybars().toNumber()).toBe(-100);
    expect(recipientTransfer?.toTinybars().toNumber()).toBe(100);
  });

  test("sets max transaction fee when provided", async () => {
    const transaction: Transaction = {
      mode: HEDERA_TRANSACTION_MODES.Send,
      family: "hedera",
      amount: new BigNumber(100),
      recipient: "0.0.456",
      maxFee: new BigNumber(50),
    };

    const result = await buildUnsignedTransaction({ account: mockAccount, transaction });
    expect(result.maxTransactionFee?.toTinybars().toNumber()).toBe(50);
  });
});
