import { getCryptoCurrencyById } from "@ledgerhq/cryptoassets";
import { HEDERA_TRANSACTION_MODES } from "./constants";
import {
  formatTransactionId,
  fromEVMAddress,
  getMemoFromBase64,
  getTransactionExplorer,
  isAutoTokenAssociationEnabled,
  isTokenAssociateTransaction,
  isTokenAssociationRequired,
  isValidExtra,
  sendRecipientCanNext,
  toEVMAddress,
} from "./logic";
import { getMockedAccount, getMockedTokenAccount } from "./test/fixtures/account.fixture";
import { getMockedOperation } from "./test/fixtures/operation.fixture";
import { getMockedHTSTokenCurrency } from "./test/fixtures/currency.fixture";
import { TransactionId } from "@hashgraph/sdk";

describe("logic", () => {
  describe("getTransactionExplorer", () => {
    test("Tx explorer URL is converted from hash to consensus timestamp", async () => {
      const explorerView = getCryptoCurrencyById("hedera").explorerViews[0];
      expect(explorerView).toEqual({
        tx: expect.any(String),
        address: expect.any(String),
      });

      const mockedOperation = getMockedOperation({
        extra: { consensusTimestamp: "1.2.3.4" },
      });

      const newUrl = getTransactionExplorer(explorerView, mockedOperation);
      expect(newUrl).toBe("https://hashscan.io/mainnet/transaction/1.2.3.4");
    });

    test("Tx explorer URL is based on transaction id if consensus timestamp is not available", async () => {
      const explorerView = getCryptoCurrencyById("hedera").explorerViews[0];
      expect(explorerView).toEqual({
        tx: expect.any(String),
        address: expect.any(String),
      });

      const mockedOperation = getMockedOperation({
        extra: { transactionId: "0.0.1234567-123-123" },
      });

      const newUrl = getTransactionExplorer(explorerView, mockedOperation);
      expect(newUrl).toBe("https://hashscan.io/mainnet/transaction/0.0.1234567-123-123");
    });
  });

  describe("isTokenAssociateTransaction", () => {
    test("returns correct value based on tx.properties", () => {
      expect(
        isTokenAssociateTransaction({
          mode: HEDERA_TRANSACTION_MODES.TokenAssociate,
        } as any),
      ).toBe(true);

      expect(
        isTokenAssociateTransaction({
          mode: HEDERA_TRANSACTION_MODES.Send,
        } as any),
      ).toBe(false);

      expect(isTokenAssociateTransaction({} as any)).toBe(false);
    });
  });

  describe("isAutoTokenAssociationEnabled", () => {
    test("returns value based on isAutoTokenAssociationEnabled flag", () => {
      expect(
        isAutoTokenAssociationEnabled({
          hederaResources: { isAutoTokenAssociationEnabled: true },
        } as any),
      ).toBe(true);

      expect(
        isAutoTokenAssociationEnabled({
          hederaResources: { isAutoTokenAssociationEnabled: false },
        } as any),
      ).toBe(false);

      expect(isAutoTokenAssociationEnabled({} as any)).toBe(false);
    });
  });

  describe("isTokenAssociationRequired", () => {
    test("should return false if token is already associated (token account exists)", () => {
      const mockedTokenCurrency = getMockedHTSTokenCurrency();
      const mockedTokenAccount = getMockedTokenAccount(mockedTokenCurrency);
      const mockedAccount = getMockedAccount({ subAccounts: [mockedTokenAccount] });

      expect(isTokenAssociationRequired(mockedAccount, mockedTokenCurrency)).toBe(false);
    });

    test("should return false if auto token associations are enabled", () => {
      const mockedTokenCurrency = getMockedHTSTokenCurrency();
      const mockedAccount = getMockedAccount({
        subAccounts: [],
        hederaResources: {
          maxAutomaticTokenAssociations: -1,
          isAutoTokenAssociationEnabled: true,
        },
      });

      expect(isTokenAssociationRequired(mockedAccount, mockedTokenCurrency)).toBe(false);
    });

    test("should return true if token is not associated and auto associations are disabled", () => {
      const mockedTokenCurrency = getMockedHTSTokenCurrency();
      const mockedAccount = getMockedAccount({ subAccounts: [] });

      expect(isTokenAssociationRequired(mockedAccount, mockedTokenCurrency)).toBe(true);
    });

    test("should return false if token is undefined", () => {
      const mockedAccount = getMockedAccount({ subAccounts: [] });

      expect(isTokenAssociationRequired(mockedAccount, undefined)).toBe(false);
    });

    test("should return false for legacy accounts without subAccounts or hederaResources", () => {
      const mockedTokenCurrency = getMockedHTSTokenCurrency();
      const mockedAccount = getMockedAccount();

      delete mockedAccount.subAccounts;
      delete mockedAccount.hederaResources;

      expect(isTokenAssociationRequired(mockedAccount, mockedTokenCurrency)).toBe(true);
    });
  });

  describe("isValidExtra", () => {
    test("returns true for object and false for invalid types", () => {
      expect(isValidExtra({ some: "value" })).toBe(true);
      expect(isValidExtra(null)).toBe(false);
      expect(isValidExtra(undefined)).toBe(false);
      expect(isValidExtra("string")).toBe(false);
      expect(isValidExtra(123)).toBe(false);
      expect(isValidExtra([])).toBe(false);
    });
  });

  describe("sendRecipientCanNext", () => {
    test("handles association warnings", () => {
      expect(sendRecipientCanNext({ warnings: {} } as any)).toBe(true);
      expect(sendRecipientCanNext({ warnings: { missingAssociation: new Error() } } as any)).toBe(
        false,
      );
      expect(
        sendRecipientCanNext({ warnings: { unverifiedAssociation: new Error() } } as any),
      ).toBe(false);
    });
  });

  describe("formatTransactionId", () => {
    test("converts SDK TransactionId format to mirror node format", () => {
      const mockTransactionId = {
        toString: () => "0.0.8835924@1759825731.231952875",
      } as TransactionId;

      const result = formatTransactionId(mockTransactionId);
      expect(result).toBe("0.0.8835924-1759825731-231952875");
    });

    test("handles different account ID formats", () => {
      const mockTransactionId = {
        toString: () => "0.0.1@1234567890.987654321",
      } as TransactionId;

      const result = formatTransactionId(mockTransactionId);
      expect(result).toBe("0.0.1-1234567890-987654321");
    });
  });

  describe("getMemoFromBase64", () => {
    it("decodes a simple base64 string", () => {
      expect(getMemoFromBase64("YnJkZw==")).toBe("brdg");
    });

    it("decodes an empty string", () => {
      expect(getMemoFromBase64("")).toBe("");
    });

    it("decodes a base64 string with spaces", () => {
      const input = Buffer.from("hello world", "utf-8").toString("base64");
      expect(getMemoFromBase64(input)).toBe("hello world");
    });

    it("decodes special characters", () => {
      const input = Buffer.from("😀✨", "utf-8").toString("base64");
      expect(getMemoFromBase64(input)).toBe("😀✨");
    });
  });

  describe("toEVMAddress", () => {
    test("returns correct EVM address for valid Hedera account ID", () => {
      const evmAddress = toEVMAddress("0.0.12345");
      expect(evmAddress).toBe("0x0000000000000000000000000000000000003039");
    });

    test("returns null for invalid Hedera account ID", () => {
      const evmAddress = toEVMAddress("invalid_account_id");
      expect(evmAddress).toBeNull();
    });
  });

  describe("fromEVMAddress", () => {
    test("should convert a long-zero EVM address to Hedera account ID", () => {
      const evmAddress = "0x00000000000000000000000000000000008b3ab3";
      const result = fromEVMAddress(evmAddress);
      expect(result).toBe("0.0.9124531");
    });

    test("should return null for non-long-zero EVM address", () => {
      const evmAddress = "0xae2e616828973ec543bbce40cf640c012c5a3805";
      const result = fromEVMAddress(evmAddress, 0, 0);
      expect(result).toBeNull();
    });

    test("should handle custom shard and realm values", () => {
      const evmAddress = "0x0000000000000000000000000000000000000064";
      const result = fromEVMAddress(evmAddress, 1, 2);
      expect(result).toBe("1.2.100");
    });

    test("should return null for invalid EVM addresses", () => {
      expect(fromEVMAddress("not-an-address")).toBeNull();
      expect(fromEVMAddress("0xInvalid")).toBeNull();
      expect(fromEVMAddress("")).toBeNull();
      expect(fromEVMAddress("1234567890")).toBeNull();
      expect(fromEVMAddress(undefined as unknown as string)).toBeNull();
    });
  });
});
