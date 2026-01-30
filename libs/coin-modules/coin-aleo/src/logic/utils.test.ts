import BigNumber from "bignumber.js";
import { PROGRAM_ID } from "../constants";
import { apiClient } from "../network/api";
import { getMockedTransaction, getMockedTransactionDetails } from "../test/fixtures/api.fixture";
import { getMockedCurrency } from "../test/fixtures/currency.fixture";
import { getMockedAccount } from "../test/fixtures/account.fixture";
import { getMockedOperation } from "../test/fixtures/operation.fixture";
import {
  parseMicrocredits,
  parseOperation,
  patchAccountWithViewKey,
  determineTransactionType,
  generateUniqueUsername,
} from "./utils";

jest.mock("../network/api");

const mockGetTransactionById = apiClient.getTransactionById as jest.MockedFunction<
  typeof apiClient.getTransactionById
>;

describe("logic utils", () => {
  const mockCurrency = getMockedCurrency();
  const mockAddress = "aleo1test";
  const mockLedgerAccountId = "js:2:aleo:aleo1test:";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("parseMicrocredits", () => {
    it("should parse valid microcredits string and remove u64 suffix", () => {
      const result = parseMicrocredits("1000000u64");

      expect(result).toBe("1000000");
    });

    it("should parse zero microcredits", () => {
      const result = parseMicrocredits("0u64");

      expect(result).toBe("0");
    });

    it("should parse large microcredits values", () => {
      const result = parseMicrocredits("999999999999999u64");

      expect(result).toBe("999999999999999");
    });

    it("should throw error when u64 suffix is missing", () => {
      const value = "1000000";
      expect(() => parseMicrocredits(value)).toThrow(`aleo: invalid balance format (${value})`);
    });

    it("should throw error for invalid format", () => {
      const value = "1000000u32";
      expect(() => parseMicrocredits(value)).toThrow(`aleo: invalid balance format (${value})`);
    });
  });

  describe("parseOperation", () => {
    it("should parse incoming credits transaction", async () => {
      const mockTx = getMockedTransaction({
        transaction_id: "at1incoming",
        sender_address: "aleo1sender",
        recipient_address: mockAddress,
        amount: 1000000,
        block_number: 1000,
        block_timestamp: "1704067200",
      });

      const mockTxDetails = getMockedTransactionDetails({
        id: mockTx.transaction_id,
        block_height: mockTx.block_number,
        block_timestamp: mockTx.block_timestamp,
      });

      mockGetTransactionById.mockResolvedValue(mockTxDetails);

      const result = await parseOperation({
        currency: mockCurrency,
        rawTx: mockTx,
        address: mockAddress,
        ledgerAccountId: mockLedgerAccountId,
      });

      expect(result).toMatchObject({
        type: "IN",
        senders: [mockTx.sender_address],
        recipients: [mockTx.recipient_address],
        value: new BigNumber(mockTx.amount),
        hasFailed: false,
        blockHeight: mockTx.block_number,
        date: new Date(Number(mockTx.block_timestamp) * 1000),
        extra: {
          functionId: mockTx.function_id,
        },
      });
    });

    it("should parse outgoing credits transaction", async () => {
      const mockTx = getMockedTransaction({
        transaction_id: "at1outgoing",
        sender_address: mockAddress,
        recipient_address: "aleo1recipient",
        amount: 500000,
        block_number: 2000,
        block_timestamp: "1704153600",
      });

      const mockTxDetails = getMockedTransactionDetails({
        id: mockTx.transaction_id,
        block_height: mockTx.block_number,
        block_timestamp: mockTx.block_timestamp,
      });

      mockGetTransactionById.mockResolvedValue(mockTxDetails);

      const result = await parseOperation({
        currency: mockCurrency,
        rawTx: mockTx,
        address: mockAddress,
        ledgerAccountId: mockLedgerAccountId,
      });

      expect(result).toMatchObject({
        type: "OUT",
        senders: [mockTx.sender_address],
        recipients: [mockTx.recipient_address],
        value: new BigNumber(mockTx.amount),
        hasFailed: false,
        blockHeight: mockTx.block_number,
      });
    });

    it("should handle non-credits transactions with type NONE", async () => {
      const mockTx = getMockedTransaction({
        transaction_id: "at1other",
        sender_address: mockAddress,
        recipient_address: "aleo1recipient",
        amount: 0,
        program_id: "custom_program.aleo",
        function_id: "custom_function",
        block_number: 3000,
        block_timestamp: "1704240000",
      });

      const result = await parseOperation({
        currency: mockCurrency,
        rawTx: mockTx,
        address: mockAddress,
        ledgerAccountId: mockLedgerAccountId,
      });

      expect(mockGetTransactionById).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        type: "NONE",
        fee: new BigNumber(0),
        blockHash: null,
      });
    });

    it("should parse failed transaction correctly", async () => {
      const mockTx = getMockedTransaction({
        transaction_id: "at1failed",
        sender_address: mockAddress,
        recipient_address: "aleo1recipient",
        amount: 100000,
        transaction_status: "Rejected",
        block_number: 4000,
        block_timestamp: "1704326400",
      });

      const mockTxDetails = getMockedTransactionDetails({
        id: mockTx.transaction_id,
        status: "rejected",
        block_height: mockTx.block_number,
        block_timestamp: mockTx.block_timestamp,
      });

      mockGetTransactionById.mockResolvedValue(mockTxDetails);

      const result = await parseOperation({
        currency: mockCurrency,
        rawTx: mockTx,
        address: mockAddress,
        ledgerAccountId: mockLedgerAccountId,
      });

      expect(result).toMatchObject({
        hasFailed: true,
        type: "OUT",
      });
    });

    it("should extract fee and block hash from transaction details", async () => {
      const mockTx = getMockedTransaction({
        transaction_id: "at1withfee",
        sender_address: mockAddress,
        recipient_address: "aleo1recipient",
        amount: 1000000,
        block_number: 5000,
        block_timestamp: "1704412800",
      });

      const mockTxDetails = getMockedTransactionDetails({
        id: mockTx.transaction_id,
        block_height: mockTx.block_number,
        block_timestamp: mockTx.block_timestamp,
        fee_value: 5000,
        fee: {
          transition: {
            id: "fee1",
            scm: "scm1",
            tcm: "tcm1",
            tpk: "tpk1",
            program: PROGRAM_ID.CREDITS,
            function: "fee_public",
            inputs: [
              {
                type: "public",
                id: "input1",
                value: "5000u64",
              },
            ],
            outputs: [],
          },
        },
      });

      mockGetTransactionById.mockResolvedValue(mockTxDetails);

      const result = await parseOperation({
        currency: mockCurrency,
        rawTx: mockTx,
        address: mockAddress,
        ledgerAccountId: mockLedgerAccountId,
      });

      expect(mockGetTransactionById).toHaveBeenCalledWith(mockCurrency, mockTx.transaction_id);
      expect(result).toMatchObject({
        fee: new BigNumber(5000),
        blockHash: mockTxDetails.block_hash,
      });
    });
  });

  describe("determineTransactionType", () => {
    it("should return private for transfer_private regardless of operation type", () => {
      expect(determineTransactionType("transfer_private", "IN")).toBe("private");
      expect(determineTransactionType("transfer_private", "OUT")).toBe("private");
      expect(determineTransactionType("transfer_private", "NONE")).toBe("private");
    });

    it("should return public for transfer_public regardless of operation type", () => {
      expect(determineTransactionType("transfer_public", "IN")).toBe("public");
      expect(determineTransactionType("transfer_public", "OUT")).toBe("public");
      expect(determineTransactionType("transfer_public", "NONE")).toBe("public");
    });

    it("should return private for IN operations ending with to_private", () => {
      expect(determineTransactionType("transfer_public_to_private", "IN")).toBe("private");
    });

    it("should return public for IN operations ending with to_public", () => {
      expect(determineTransactionType("transfer_private_to_public", "IN")).toBe("public");
    });

    it("should return private for OUT operations starting with transfer_private", () => {
      expect(determineTransactionType("transfer_private_to_public", "OUT")).toBe("private");
    });

    it("should return public for OUT operations starting with transfer_public", () => {
      expect(determineTransactionType("transfer_public_to_private", "OUT")).toBe("public");
    });

    it("should return undefined for unrecognized function ids", () => {
      expect(determineTransactionType("unknown_function", "IN")).toBeUndefined();
      expect(determineTransactionType("unknown_function", "OUT")).toBeUndefined();
    });

    it("should return undefined for NONE operations with cross-balance transfers", () => {
      expect(determineTransactionType("transfer_public_to_private", "NONE")).toBeUndefined();
      expect(determineTransactionType("transfer_private_to_public", "NONE")).toBeUndefined();
    });
  });

  describe("patchAccountWithViewKey", () => {
    it("should encode viewKey in account id", () => {
      const mockViewKey = "AViewKey1mockviewkey";
      const mockAccount = getMockedAccount({
        id: "js:2:aleo:aleo1test:",
        operations: [],
      });

      const result = patchAccountWithViewKey(mockAccount, mockViewKey);

      expect(result.id).not.toBe(mockAccount.id);
      expect(result.id).toBe(`js:2:aleo:aleo1test::${mockViewKey}`);
    });

    it("should update operation ids with new account id", () => {
      const mockViewKey = "AViewKey1mockviewkey";
      const mockOp1 = getMockedOperation({
        id: "js:2:aleo:aleo1test:-op1-OUT",
        accountId: "js:2:aleo:aleo1test:",
        hash: "op1",
        type: "OUT",
      });

      const mockOp2 = getMockedOperation({
        id: "js:2:aleo:aleo1test:-op2-IN",
        accountId: "js:2:aleo:aleo1test:",
        hash: "op2",
        type: "IN",
      });

      const mockAccount = getMockedAccount({
        id: "js:2:aleo:aleo1test:",
        operations: [mockOp1, mockOp2],
      });

      const result = patchAccountWithViewKey(mockAccount, mockViewKey);

      expect(result.operations).toEqual([
        expect.objectContaining({
          id: `js:2:aleo:aleo1test::${mockViewKey}-op1-OUT`,
          accountId: `js:2:aleo:aleo1test::${mockViewKey}`,
        }),
        expect.objectContaining({
          id: `js:2:aleo:aleo1test::${mockViewKey}-op2-IN`,
          accountId: `js:2:aleo:aleo1test::${mockViewKey}`,
        }),
      ]);
    });
  });

  describe("generateUniqueUsername", () => {
    it("should generate username with timestamp and address", () => {
      const mockAddress = "aleo1test123";
      const beforeTimestamp = new Date().getTime();

      const result = generateUniqueUsername(mockAddress);

      const afterTimestamp = new Date().getTime();

      expect(result).toContain(mockAddress);
      expect(result).toMatch(/^\d+_aleo1test123$/);

      const [timestamp] = result.split("_");
      const parsedTimestamp = parseInt(timestamp, 10);

      expect(parsedTimestamp).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(parsedTimestamp).toBeLessThanOrEqual(afterTimestamp);
    });

    it("should handle different addresses", () => {
      const address1 = "aleo1address1";
      const address2 = "aleo1address2";

      const result1 = generateUniqueUsername(address1);
      const result2 = generateUniqueUsername(address2);

      expect(result1).toContain(address1);
      expect(result2).toContain(address2);
      expect(result1).not.toContain(address2);
      expect(result2).not.toContain(address1);
    });
  });
});
