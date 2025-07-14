import { BigNumber } from "bignumber.js";
import { getEnv, setEnv } from "@ledgerhq/live-env";
import { Operation } from "@ledgerhq/types-live";
import { getCryptoCurrencyById } from "@ledgerhq/cryptoassets";
import {
  extractCompanyFromNodeDescription,
  getDefaultValidator,
  getDelegationStatus,
  getHederaOperationType,
  getTransactionExplorer,
  getValidatorFromAccount,
  isStakingTransaction,
  isValidExtra,
  sortValidators,
} from "./logic";
import type { HederaAccount, HederaPreloadData, HederaValidator, Transaction } from "./types";
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
      expect(explorerView).toBeDefined();
      expect(explorerView.tx).toBeDefined();

      const mockOperation: Operation = {
        extra: {
          consensusTimestamp: "1.2.3.4",
        },
        id: "",
        hash: "",
        type: "IN",
        value: new BigNumber(0),
        fee: new BigNumber(0),
        senders: [],
        recipients: [],
        blockHeight: undefined,
        blockHash: undefined,
        accountId: "",
        date: new Date(),
      };

      const newUrl = getTransactionExplorer(explorerView, mockOperation);
      expect(newUrl).toBe("https://hashscan.io/mainnet/transaction/1.2.3.4");
    });

    test("Tx explorer URL is based on transaction id if consensus timestamp is not available", async () => {
      const explorerView = getCryptoCurrencyById("hedera").explorerViews[0];
      expect(explorerView).toBeDefined();
      expect(explorerView.tx).toBeDefined();

      const mockOperation: Operation = {
        extra: {
          transactionId: "0.0.1234567-123-123",
        },
        id: "",
        hash: "",
        type: "IN",
        value: new BigNumber(0),
        fee: new BigNumber(0),
        senders: [],
        recipients: [],
        blockHeight: undefined,
        blockHash: undefined,
        accountId: "",
        date: new Date(),
      };

      const newUrl = getTransactionExplorer(explorerView, mockOperation);
      expect(newUrl).toBe("https://hashscan.io/mainnet/transaction/0.0.1234567-123-123");
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

  describe("extractCompanyFromNodeDescription", () => {
    test("extracts company name from description", () => {
      expect(extractCompanyFromNodeDescription("Hosted by Ledger | Paris, France")).toBe("Ledger");
      expect(extractCompanyFromNodeDescription("Hosted by LG | Seoul, South Korea")).toBe("LG");
      expect(extractCompanyFromNodeDescription("TestCompany | something else")).toBe("TestCompany");
      expect(extractCompanyFromNodeDescription("NoSeparator ")).toBe("NoSeparator");
    });
  });

  describe("sortValidators", () => {
    test("sorts validators by nodeId asc, Ledger node first if set", () => {
      setEnv("HEDERA_STAKING_LEDGER_NODE_ID", 2);
      const validators = [{ nodeId: 3 }, { nodeId: 2 }, { nodeId: 1 }] as HederaValidator[];
      const sorted = sortValidators(validators);
      expect(sorted[0].nodeId).toBe(2);
      expect(sorted[1].nodeId).toBe(1);
      expect(sorted[2].nodeId).toBe(3);
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
    const mockStakingTx = { properties: { name: "staking" } } as Transaction;
    const mockTransferTx = { recipient: "", amount: new BigNumber(1) } as Transaction;
    const mockEmptyTx = {} as Transaction;

    test("returns CryptoUpdate for staking tx", () => {
      expect(getHederaOperationType(mockStakingTx)).toBe("CryptoUpdate");
    });

    test("returns CryptoTransfer for other txs", () => {
      expect(getHederaOperationType(mockTransferTx)).toBe("CryptoTransfer");
      expect(getHederaOperationType(mockEmptyTx)).toBe("CryptoTransfer");
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

    test("returns validator with highest activeStake if no Ledger node", () => {
      expect(getDefaultValidator(mockValidators)?.nodeId).toBe(3);
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
});
