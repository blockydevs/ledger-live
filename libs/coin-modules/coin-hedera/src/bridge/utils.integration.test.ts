import BigNumber from "bignumber.js";
import cvsApi from "@ledgerhq/live-countervalues/api/index";
import { getMockedAccount, getMockedTokenAccount } from "../test/fixtures/account";
import { getMockedTransaction } from "../test/fixtures/transaction";
import { calculateAmount, getCurrencyToUSDRate, getEstimatedFees } from "./utils";
import { getMockedTokenCurrency } from "../test/fixtures/currency";

jest.mock("@ledgerhq/live-countervalues/api/index");

const mockedFetchLatest = cvsApi.fetchLatest as jest.MockedFunction<typeof cvsApi.fetchLatest>;

describe("utils - calculateAmount", () => {
  let estimatedFees: Record<"crypto" | "associate", BigNumber>;

  beforeAll(async () => {
    const mockedAccount = getMockedAccount();
    const [crypto, associate] = await Promise.all([
      getEstimatedFees(mockedAccount, "CryptoTransfer"),
      getEstimatedFees(mockedAccount, "TokenAssociate"),
    ]);

    estimatedFees = { crypto, associate };
  });

  test("HBAR transfer, useAllAmount = true", async () => {
    const mockedAccount = getMockedAccount();
    const mockedTransaction = getMockedTransaction({ useAllAmount: true });

    const amount = mockedAccount.balance.minus(estimatedFees.crypto);
    const totalSpent = amount.plus(estimatedFees.crypto);

    const result = await calculateAmount({
      account: mockedAccount,
      transaction: mockedTransaction,
    });

    expect(result).toEqual({ amount, totalSpent });
  });

  test("HBAR transfer, useAllAmount = false", async () => {
    const mockedAccount = getMockedAccount();
    const mockedTransaction = getMockedTransaction({
      useAllAmount: false,
      amount: new BigNumber(1000000),
    });

    const amount = mockedTransaction.amount;
    const totalSpent = amount.plus(estimatedFees.crypto);

    const result = await calculateAmount({
      account: mockedAccount,
      transaction: mockedTransaction,
    });

    expect(result).toEqual({ amount, totalSpent });
  });

  test("token transfer, useAllAmount = true", async () => {
    const mockedTokenCurrency = getMockedTokenCurrency();
    const mockedTokenAccount = getMockedTokenAccount(mockedTokenCurrency);
    const mockedAccount = getMockedAccount({ subAccounts: [mockedTokenAccount] });
    const mockedTransaction = getMockedTransaction({
      useAllAmount: true,
      subAccountId: mockedTokenAccount.id,
    });

    const amount = mockedTokenAccount.balance;
    const totalSpent = amount;

    const result = await calculateAmount({
      account: mockedAccount,
      transaction: mockedTransaction,
    });

    expect(result).toEqual({ amount, totalSpent });
  });

  test("token transfer, useAllAmount = false", async () => {
    const mockedTokenCurrency = getMockedTokenCurrency();
    const mockedTokenAccount = getMockedTokenAccount(mockedTokenCurrency);
    const mockedAccount = getMockedAccount({ subAccounts: [mockedTokenAccount] });
    const mockedTransaction = getMockedTransaction({
      useAllAmount: false,
      amount: new BigNumber(1),
      subAccountId: mockedTokenAccount.id,
    });

    const amount = mockedTransaction.amount;
    const totalSpent = amount;

    const result = await calculateAmount({
      account: mockedAccount,
      transaction: mockedTransaction,
    });

    expect(result).toEqual({ amount, totalSpent });
  });

  test("token associate operation uses TokenAssociate fee", async () => {
    const mockedTokenCurrency = getMockedTokenCurrency();
    const mockedTokenAccount = getMockedTokenAccount(mockedTokenCurrency);
    const mockedAccount = getMockedAccount({ subAccounts: [mockedTokenAccount] });
    const mockedTransaction = getMockedTransaction({
      useAllAmount: false,
      amount: new BigNumber(1),
      properties: {
        name: "tokenAssociate",
        token: mockedTokenCurrency,
      },
    });

    const amount = mockedTransaction.amount;
    const totalSpent = amount.plus(estimatedFees.associate);

    const result = await calculateAmount({
      account: mockedAccount,
      transaction: mockedTransaction,
    });

    expect(result).toEqual({ amount, totalSpent });
  });
});

describe("utils - getEstimatedFees", () => {
  const mockedAccount = getMockedAccount();

  beforeEach(() => {
    jest.clearAllMocks();
    // reset cache to make sure all tests receive correct mocks from mockedFetchLatest
    getCurrencyToUSDRate.clear(mockedAccount.currency.name);
  });

  test("returns estimated fee based on USD rate for CryptoTransfer", async () => {
    // 1 HBAR = 1 USD
    const usdRate = 1;
    mockedFetchLatest.mockResolvedValue([usdRate]);

    const result = await getEstimatedFees(mockedAccount, "CryptoTransfer");

    const baseFeeTinybar = 0.0001 * 10 ** 8;
    const expectedFee = new BigNumber(baseFeeTinybar)
      .div(usdRate)
      .integerValue(BigNumber.ROUND_CEIL)
      .multipliedBy(2); // safety rate

    expect(result.toFixed()).toBe(expectedFee.toFixed());
  });

  test("returns estimated fee based on USD rate for TokenTransfer", async () => {
    // 1 HBAR = 0.5 USD
    const usdRate = 0.5;
    mockedFetchLatest.mockResolvedValue([usdRate]);

    const result = await getEstimatedFees(mockedAccount, "TokenTransfer");

    const baseFeeTinybar = 0.001 * 10 ** 8;
    const expectedFee = new BigNumber(baseFeeTinybar)
      .div(usdRate)
      .integerValue(BigNumber.ROUND_CEIL)
      .multipliedBy(2);

    expect(result.toFixed()).toBe(expectedFee.toFixed());
  });

  test("returns estimated fee based on USD rate for TokenAssociate", async () => {
    // 1 HBAR = 2 USD
    const usdRate = 2;
    mockedFetchLatest.mockResolvedValue([usdRate]);

    const result = await getEstimatedFees(mockedAccount, "TokenAssociate");

    const baseFeeTinybar = 0.05 * 10 ** 8;
    const expectedFee = new BigNumber(baseFeeTinybar)
      .div(usdRate)
      .integerValue(BigNumber.ROUND_CEIL)
      .multipliedBy(2);

    expect(result.toFixed()).toBe(expectedFee.toFixed());
  });

  test("falls back to default estimate when cvs api returns null", async () => {
    const usdRate = null;
    mockedFetchLatest.mockResolvedValue([usdRate]);

    const result = await getEstimatedFees(mockedAccount, "CryptoTransfer");

    const expected = new BigNumber("150200").multipliedBy(2);
    expect(result.toFixed()).toBe(expected.toFixed());
  });

  test("falls back to default estimate on cvs api failure", async () => {
    mockedFetchLatest.mockRejectedValue(new Error("Network error"));

    const result = await getEstimatedFees(mockedAccount, "CryptoTransfer");

    const expected = new BigNumber("150200").multipliedBy(2);
    expect(result.toFixed()).toBe(expected.toFixed());
  });
});
