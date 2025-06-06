import { getCryptoCurrencyById } from "@ledgerhq/cryptoassets";
import { getTransactionExplorer, isTokenAssociationRequired } from "./logic";
import { getMockedAccount, getMockedTokenAccount } from "./test/fixtures/account";
import { getMockedOperation } from "./test/fixtures/operation";
import { getMockedTokenCurrency } from "./test/fixtures/currency";

describe("getTransactionExplorer", () => {
  test("Tx explorer URL is converted from hash to consensus timestamp", async () => {
    const explorerView = getCryptoCurrencyById("hedera").explorerViews[0];
    expect(explorerView).toBeDefined();
    expect(explorerView.tx).toBeDefined();

    const mockedOperation = getMockedOperation({
      extra: { consensusTimestamp: "1.2.3.4" },
    });

    const newUrl = getTransactionExplorer(explorerView, mockedOperation);
    expect(newUrl).toBe("https://hashscan.io/mainnet/transaction/1.2.3.4");
  });

  test("Tx explorer URL is based on transaction id if consensus timestamp is not available", async () => {
    const explorerView = getCryptoCurrencyById("hedera").explorerViews[0];
    expect(explorerView).toBeDefined();
    expect(explorerView.tx).toBeDefined();

    const mockedOperation = getMockedOperation({
      extra: { transactionId: "0.0.1234567-123-123" },
    });

    const newUrl = getTransactionExplorer(explorerView, mockedOperation);
    expect(newUrl).toBe("https://hashscan.io/mainnet/transaction/0.0.1234567-123-123");
  });
});

describe("isTokenAssociationRequired", () => {
  it("should return false if token is already associated (token account exists)", () => {
    const mockedTokenCurrency = getMockedTokenCurrency();
    const mockedTokenAccount = getMockedTokenAccount(mockedTokenCurrency);
    const mockedAccount = getMockedAccount({ subAccounts: [mockedTokenAccount] });

    expect(isTokenAssociationRequired(mockedAccount, mockedTokenCurrency)).toBe(false);
  });

  it("should return false if auto token associations are enabled", () => {
    const mockedTokenCurrency = getMockedTokenCurrency();
    const mockedAccount = getMockedAccount({
      subAccounts: [],
      hederaResources: {
        maxAutomaticTokenAssociations: -1,
        isAutoTokenAssociationsEnabled: true,
      },
    });

    expect(isTokenAssociationRequired(mockedAccount, mockedTokenCurrency)).toBe(false);
  });

  it("should return true if token is not associated and auto associations are disabled", () => {
    const mockedTokenCurrency = getMockedTokenCurrency();
    const mockedAccount = getMockedAccount({ subAccounts: [] });

    expect(isTokenAssociationRequired(mockedAccount, mockedTokenCurrency)).toBe(true);
  });

  it("should return false if token is undefined", () => {
    const mockedAccount = getMockedAccount({ subAccounts: [] });

    expect(isTokenAssociationRequired(mockedAccount, undefined)).toBe(false);
  });

  it("should return false for legacy accounts without subAccounts or hederaResources", () => {
    const mockedTokenCurrency = getMockedTokenCurrency();
    const mockedAccount = getMockedAccount();

    delete mockedAccount.subAccounts;
    delete mockedAccount.hederaResources;

    expect(isTokenAssociationRequired(mockedAccount, mockedTokenCurrency)).toBe(true);
  });
});
