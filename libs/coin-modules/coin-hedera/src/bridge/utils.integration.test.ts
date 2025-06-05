import BigNumber from "bignumber.js";
import { calculateAmount, getEstimatedFees } from "./utils";
import { getMockedAccount } from "../test/fixtures/account";
import { getMockedTransaction } from "../test/fixtures/transaction";

const mockedAccount = getMockedAccount();

describe("utils", () => {
  let estimatedFees = new BigNumber("150200").multipliedBy(2); // 0.001502 ℏ (as of 2023-03-14)

  beforeAll(async () => {
    estimatedFees = await getEstimatedFees(mockedAccount, "CryptoTransfer");
  });

  test("calculateAmount transaction.useAllAmount = true", async () => {
    const mockedTransaction = getMockedTransaction({ useAllAmount: true });
    const amount = mockedAccount.balance.minus(estimatedFees);
    const totalSpent = amount.plus(estimatedFees);
    const data = {
      amount,
      totalSpent,
    };

    const result = await calculateAmount({
      account: mockedAccount,
      transaction: mockedTransaction,
    });

    expect(result).toEqual(data);
  });

  test("calculateAmount transaction.useAllAmount = false", async () => {
    const mockedTransaction = getMockedTransaction({ useAllAmount: false });
    const amount = mockedTransaction.amount;
    const totalSpent = amount.plus(estimatedFees);
    const data = {
      amount,
      totalSpent,
    };

    const result = await calculateAmount({
      account: mockedAccount,
      transaction: mockedTransaction,
    });

    expect(result).toEqual(data);
  });
});
