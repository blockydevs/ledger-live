import BigNumber from "bignumber.js";
import { prepareTransaction } from "./prepareTransaction";
import { getMockedAccount } from "../test/fixtures/account.fixture";
import { getMockedTransaction } from "../test/fixtures/transaction.fixture";
import * as utils from "./utils";

describe("prepareTransaction", () => {
  const mockAccount = getMockedAccount();

  const mockTx = getMockedTransaction();

  beforeEach(() => {
    jest.clearAllMocks();

    jest.spyOn(utils, "getEstimatedFees").mockResolvedValue(Promise.resolve(new BigNumber(10)));
    jest
      .spyOn(utils, "calculateAmount")
      .mockResolvedValue(
        Promise.resolve({ amount: new BigNumber(100), totalSpent: new BigNumber(100) }),
      );
  });

  test("should set amount and maxFee from utils", async () => {
    const result = await prepareTransaction(mockAccount, mockTx);
    expect(result.amount).toStrictEqual(new BigNumber(100));
    expect(result.maxFee).toStrictEqual(new BigNumber(10));
  });
});
