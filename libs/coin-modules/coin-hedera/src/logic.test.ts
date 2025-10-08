import BigNumber from "bignumber.js";
import { getCryptoCurrencyById } from "@ledgerhq/cryptoassets";
import { getEnv, setEnv } from "@ledgerhq/live-env";
import {
  extractCompanyFromNodeDescription,
  filterValidatorBySearchTerm,
  getChecksum,
  getDefaultValidator,
  getDelegationStatus,
  getHederaOperationType,
  getTransactionExplorer,
  getValidatorFromAccount,
  isAutoTokenAssociationEnabled,
  isStakingTransaction,
  isTokenAssociateTransaction,
  isTokenAssociationRequired,
  isValidExtra,
  sendRecipientCanNext,
  sortValidators,
} from "./logic";
import { getMockedAccount, getMockedTokenAccount } from "./test/fixtures/account.fixture";
import { getMockedOperation } from "./test/fixtures/operation.fixture";
import { getMockedTokenCurrency } from "./test/fixtures/currency.fixture";
import { HEDERA_TRANSACTION_MODES } from "./constants";
import { HederaAccount, HederaPreloadData, HederaValidator, Transaction } from "./types";
import * as preloadData from "./preload-data";

describe("logic", () => {
  let oldStakingLedgerNodeIdEnv: number;

  beforeAll(() => {
    oldStakingLedgerNodeIdEnv = getEnv("HEDERA_STAKING_LEDGER_NODE_ID");
  });

  afterEach(() => {
    setEnv("HEDERA_STAKING_LEDGER_NODE_ID", oldStakingLedgerNodeIdEnv);
  });

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
      const mockedTokenCurrency = getMockedTokenCurrency();
      const mockedTokenAccount = getMockedTokenAccount(mockedTokenCurrency);
      const mockedAccount = getMockedAccount({ subAccounts: [mockedTokenAccount] });

      expect(isTokenAssociationRequired(mockedAccount, mockedTokenCurrency)).toBe(false);
    });

    test("should return false if auto token associations are enabled", () => {
      const mockedTokenCurrency = getMockedTokenCurrency();
      const mockedAccount = getMockedAccount({
        subAccounts: [],
        hederaResources: {
          maxAutomaticTokenAssociations: -1,
          isAutoTokenAssociationEnabled: true,
          delegation: null,
        },
      });

      expect(isTokenAssociationRequired(mockedAccount, mockedTokenCurrency)).toBe(false);
    });

    test("should return true if token is not associated and auto associations are disabled", () => {
      const mockedTokenCurrency = getMockedTokenCurrency();
      const mockedAccount = getMockedAccount({ subAccounts: [] });

      expect(isTokenAssociationRequired(mockedAccount, mockedTokenCurrency)).toBe(true);
    });

    test("should return false if token is undefined", () => {
      const mockedAccount = getMockedAccount({ subAccounts: [] });

      expect(isTokenAssociationRequired(mockedAccount, undefined)).toBe(false);
    });

    test("should return false for legacy accounts without subAccounts or hederaResources", () => {
      const mockedTokenCurrency = getMockedTokenCurrency();
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

  describe("isStakingTransaction", () => {
    test("returns correct value based on tx.properties", () => {
      const stakingTx = { properties: { name: "staking" } } as Transaction;
      const transferTx = { recipient: "", amount: new BigNumber(1) } as Transaction;
      const emptyTx = {} as Transaction;

      expect(isStakingTransaction(stakingTx)).toBe(true);
      expect(isStakingTransaction(transferTx)).toBe(false);
      expect(isStakingTransaction(emptyTx)).toBe(false);
    });
  });

  describe("extractCompanyFromNodeDescription", () => {
    test("extracts company name from description", () => {
      expect(extractCompanyFromNodeDescription("Hosted by Ledger | Paris, France")).toBe("Ledger");
      expect(extractCompanyFromNodeDescription("Hosted by LG | Seoul, South Korea")).toBe("LG");
      expect(extractCompanyFromNodeDescription("TestCompany | something else")).toBe("TestCompany");
      expect(extractCompanyFromNodeDescription("NoSeparator ")).toBe("NoSeparator");
    });
  });

  describe("sortValidators", () => {
    test("sorts validators by active stake ASC, Ledger node first if set", () => {
      setEnv("HEDERA_STAKING_LEDGER_NODE_ID", 2);

      const validators = [
        { nodeId: 3, activeStake: new BigNumber(1000) },
        { nodeId: 2, activeStake: new BigNumber(2000) },
        { nodeId: 1, activeStake: new BigNumber(3000) },
      ] as HederaValidator[];

      const sorted = sortValidators(validators);
      expect(sorted[0].nodeId).toBe(2);
      expect(sorted[1].nodeId).toBe(3);
      expect(sorted[2].nodeId).toBe(1);
    });
  });

  describe("getValidatorFromAccount", () => {
    const mockValidator = { nodeId: 1 };
    const mockPreload = { validators: [mockValidator] } as HederaPreloadData;

    beforeEach(() => {
      jest.clearAllMocks();

      jest.spyOn(preloadData, "getCurrentHederaPreloadData").mockReturnValueOnce(mockPreload);
    });

    test("returns validator matching delegation nodeId", () => {
      const mockAccount = {
        currency: "hedera",
        hederaResources: { delegation: { nodeId: 1 } },
      } as unknown as HederaAccount;

      expect(getValidatorFromAccount(mockAccount)).toEqual(mockValidator);
    });

    test("returns null if no delegation", () => {
      const mockAccount = {
        currency: "hedera",
        hederaResources: {},
      } as unknown as HederaAccount;

      expect(getValidatorFromAccount(mockAccount)).toBeNull();
    });
  });

  describe("getHederaOperationType", () => {
    const mockAccount = {
      currency: "hedera",
      hederaResources: { delegation: { nodeId: 1 } },
    } as unknown as HederaAccount;
    const mockStakingTx = { properties: { name: "staking" } } as Transaction;
    const mockTransferTx = { recipient: "", amount: new BigNumber(1) } as Transaction;
    const mockEmptyTx = {} as Transaction;

    test("returns CryptoUpdate for staking tx", () => {
      expect(getHederaOperationType(mockAccount, mockStakingTx)).toBe("CryptoUpdate");
    });

    test("returns CryptoTransfer for other txs", () => {
      expect(getHederaOperationType(mockAccount, mockTransferTx)).toBe("CryptoTransfer");
      expect(getHederaOperationType(mockAccount, mockEmptyTx)).toBe("CryptoTransfer");
      expect(getHederaOperationType(mockAccount, undefined)).toBe("CryptoTransfer");
    });
  });

  describe("getDefaultValidator", () => {
    const mockValidators = [
      { nodeId: 1, activeStake: new BigNumber(2000) },
      { nodeId: 2, activeStake: new BigNumber(1000) },
      { nodeId: 3, activeStake: new BigNumber(10000) },
    ] as HederaValidator[];

    test("returns Ledger validator if present", () => {
      setEnv("HEDERA_STAKING_LEDGER_NODE_ID", 2);
      expect(getDefaultValidator(mockValidators)?.nodeId).toBe(2);
    });

    test("returns validator with lowest activeStake if no Ledger node", () => {
      expect(getDefaultValidator(mockValidators)?.nodeId).toBe(2);
    });

    test("returns null if validators empty", () => {
      expect(getDefaultValidator([])).toBeNull();
    });
  });

  describe("getDelegationStatus", () => {
    const mockValidator = { overstaked: false } as HederaValidator;
    const mockOverstakedValidator = { overstaked: true } as HederaValidator;

    test("returns inactive if validator is null", () => {
      expect(getDelegationStatus(null)).toBe("inactive");
    });

    test("returns overstaked if validator.overstaked is true", () => {
      expect(getDelegationStatus(mockOverstakedValidator)).toBe("overstaked");
    });

    test("returns active otherwise", () => {
      expect(getDelegationStatus(mockValidator)).toBe("active");
    });
  });

  describe("getChecksum", () => {
    test("returns checksum for valid account id", () => {
      const result1 = getChecksum("0.0.17");
      const result2 = getChecksum("0.0.17-sahgw");

      expect(result1).toBe("sahgw");
      expect(result2).toBe("sahgw");
    });

    test("returns null for invalid account id", () => {
      const result = getChecksum("0.0.test");

      expect(result).toBeNull();
    });
  });

  describe("filterValidatorBySearchTerm", () => {
    const mockValidator: HederaValidator = {
      nodeId: 123,
      name: "Validator Test",
      address: "0.0.456",
      addressChecksum: "abcde",
      minStake: new BigNumber(0),
      maxStake: new BigNumber(0),
      activeStake: new BigNumber(0),
      activeStakePercentage: new BigNumber(0),
      overstaked: false,
    };

    test("should match by nodeId", () => {
      expect(filterValidatorBySearchTerm(mockValidator, "123")).toBe(true);
    });

    test("should match by name with case insensitivity", () => {
      expect(filterValidatorBySearchTerm(mockValidator, "validator")).toBe(true);
      expect(filterValidatorBySearchTerm(mockValidator, "VALIDATOR")).toBe(true);
      expect(filterValidatorBySearchTerm(mockValidator, "test")).toBe(true);
      expect(filterValidatorBySearchTerm(mockValidator, "unknown")).toBe(false);
    });

    test("should match by address", () => {
      expect(filterValidatorBySearchTerm(mockValidator, "0.0.456")).toBe(true);
      expect(filterValidatorBySearchTerm(mockValidator, "456")).toBe(true);
      expect(filterValidatorBySearchTerm(mockValidator, "789")).toBe(false);
    });

    test("should match by address with checksum", () => {
      expect(filterValidatorBySearchTerm(mockValidator, "0.0.456-abcde")).toBe(true);
      expect(filterValidatorBySearchTerm(mockValidator, "abcde")).toBe(true);
      expect(filterValidatorBySearchTerm(mockValidator, "ABC")).toBe(true);
    });

    test("should handle validator without checksum", () => {
      const validatorWithoutChecksum = { ...mockValidator, addressChecksum: null };
      expect(filterValidatorBySearchTerm(validatorWithoutChecksum, "0.0.456")).toBe(true);
      expect(filterValidatorBySearchTerm(validatorWithoutChecksum, "abcde")).toBe(false);
    });

    test("should handle empty search term", () => {
      expect(filterValidatorBySearchTerm(mockValidator, "")).toBe(true);
    });

    test("should handle partial matches", () => {
      expect(filterValidatorBySearchTerm(mockValidator, "valid")).toBe(true);
      expect(filterValidatorBySearchTerm(mockValidator, "0.0")).toBe(true);
      expect(filterValidatorBySearchTerm(mockValidator, "12")).toBe(true);
    });
  });
});
