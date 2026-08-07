import { BalanceOptions, TransactionIntent } from "@ledgerhq/coin-module-framework/api/types";
import { InvalidParameterError } from "@ledgerhq/errors";
import BigNumber from "bignumber.js";
import coinConfig from "../config";
import { HARDCODED_BLOCK_HEIGHT, HEDERA_OPERATION_TYPES } from "../constants";
import * as logic from "../logic";
import * as logicUtils from "../logic/utils";
import { mapIntentToSDKOperation } from "../logic/utils";
import { apiClient } from "../network/api";
import * as networkUtils from "../network/utils";
import { getMockedConfig } from "../test/fixtures/config.fixture";
import { getMockedCurrency } from "../test/fixtures/currency.fixture";
import { getMockedOperation } from "../test/fixtures/operation.fixture";
import { HederaMemo } from "../types";
import { createApi } from "./index";

jest.mock("../logic");
jest.mock("../logic/utils");
jest.mock("../network/utils");
jest.mock("../network/api");

const mockExtractInitiator = jest.mocked(logicUtils.extractInitiator);
const mockGetDateRangeFromBlockHeight = jest.mocked(logicUtils.getDateRangeFromBlockHeight);
const mockGetOperationValue = jest.mocked(logicUtils.getOperationValue);
const mockMapIntentToSDKOperation = jest.mocked(mapIntentToSDKOperation);
const mockToEVMAddress = jest.mocked(networkUtils.toEVMAddress);
const mockGetAccountTokens = jest.mocked(apiClient.getAccountTokens);
const mockGetERC20BalancesForAccountV2 = jest.mocked(networkUtils.getERC20BalancesForAccountV2);
const mockBase64ToUrlSafeBase64 = jest.mocked(logicUtils.base64ToUrlSafeBase64);
const mockBroadcast = jest.mocked(logic.broadcast);
const mockCombine = jest.mocked(logic.combine);
const mockCraftTransaction = jest.mocked(logic.craftTransaction);
const mockEstimateFees = jest.mocked(logic.estimateFees);
const mockGetBalance = jest.mocked(logic.getBalance);
const mockLastBlockV2 = jest.mocked(logic.lastBlockV2);
const mockGetBlockV2 = jest.mocked(logic.getBlockV2);
const mockGetBlockInfo = jest.mocked(logic.getBlockInfo);
const mockGetValidators = jest.mocked(logic.getValidators);
const mockGetStakes = jest.mocked(logic.getStakes);
const mockGetRewards = jest.mocked(logic.getRewards);
const mockListOperationsV2 = jest.mocked(logic.listOperationsV2);

describe("createApi", () => {
  let api: ReturnType<typeof createApi>;
  const mockConfig = { ...getMockedConfig() };
  const mockCurrency = getMockedCurrency();

  beforeEach(() => {
    jest.clearAllMocks();
    api = createApi(mockConfig, mockCurrency.id);
  });

  it("should set the coin config value", () => {
    const mockSetCoinConfig = jest.spyOn(coinConfig, "setCoinConfig");

    createApi(mockConfig, mockCurrency.id);
    const config = coinConfig.getCoinConfig(mockCurrency.id);

    expect(mockSetCoinConfig).toHaveBeenCalled();
    expect(config).toMatchObject({
      status: { type: "active" },
    });
  });

  it("should return an API object with coin module api methods", () => {
    expect(api.broadcast).toBeInstanceOf(Function);
    expect(api.call).toBeInstanceOf(Function);
    expect(api.combine).toBeInstanceOf(Function);
    expect(api.craftTransaction).toBeInstanceOf(Function);
    expect(api.estimateFees).toBeInstanceOf(Function);
    expect(api.getBalance).toBeInstanceOf(Function);
    expect(api.getBlock).toBeInstanceOf(Function);
    expect(api.getBlockInfo).toBeInstanceOf(Function);
    expect(api.getValidators).toBeInstanceOf(Function);
    expect(api.getStakes).toBeInstanceOf(Function);
    expect(api.getRewards).toBeInstanceOf(Function);
    expect(api.lastBlock).toBeInstanceOf(Function);
    expect(api.listOperations).toBeInstanceOf(Function);
  });

  describe("broadcast", () => {
    it("should call broadcast from logic and return base64 hash", async () => {
      const fakeHash = new Uint8Array([1, 2, 3]);
      // @ts-expect-error - partial mock
      mockBroadcast.mockResolvedValue({ transactionHash: fakeHash });
      mockBase64ToUrlSafeBase64.mockImplementation(value => value);

      const result = await api.broadcast("tx");

      expect(mockBroadcast).toHaveBeenCalledTimes(1);
      expect(result).toBe(Buffer.from(fakeHash).toString("base64"));
    });

    it("returns a url-safe hash from broadcast", async () => {
      const { base64ToUrlSafeBase64: actualBase64ToUrlSafeBase64 } =
        jest.requireActual("../logic/utils");
      // These bytes encode to base64 containing both `+` and `/`.
      const hashWithPlusAndSlash = new Uint8Array([251, 239, 190, 255, 62]);
      // @ts-expect-error - partial mock
      mockBroadcast.mockResolvedValue({ transactionHash: hashWithPlusAndSlash });
      mockBase64ToUrlSafeBase64.mockImplementation(actualBase64ToUrlSafeBase64);

      const result = await api.broadcast("tx");

      const rawBase64Hash = Buffer.from(hashWithPlusAndSlash).toString("base64");
      expect(rawBase64Hash).toMatch(/[+/]/);
      expect(result).toBe(actualBase64ToUrlSafeBase64(rawBase64Hash));
      expect(result).not.toMatch(/[+/]/);
    });
  });

  describe("combine", () => {
    it("should call combine from logic", () => {
      mockCombine.mockReturnValue("combined-tx");

      const result = api.combine("tx", "sig", "pubkey");

      expect(mockCombine).toHaveBeenCalledTimes(1);
      expect(result).toBe("combined-tx");
    });
  });

  describe("craftTransaction", () => {
    it("should call craftTransaction from logic and return serializedTx", async () => {
      // @ts-expect-error - partial mock
      mockCraftTransaction.mockResolvedValue({ serializedTx: "serialized" });
      // @ts-expect-error - partial intent
      const txIntent: TransactionIntent<HederaMemo> = {
        useAllAmount: false,
        recipient: "0.0.1234",
        amount: 100n,
      };

      const result = await api.craftTransaction(txIntent);

      expect(mockCraftTransaction).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ transaction: "serialized" });
    });

    it("crafts a transaction when useAllAmount is set, trusting intent.amount", async () => {
      // @ts-expect-error - partial mock
      mockCraftTransaction.mockResolvedValue({ serializedTx: "serialized" });
      // @ts-expect-error - partial intent
      const txIntent: TransactionIntent<HederaMemo> = {
        useAllAmount: true,
        recipient: "0.0.1234",
        amount: 999n,
      };

      const result = await api.craftTransaction(txIntent);

      expect(mockCraftTransaction).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ transaction: "serialized" });
    });
  });

  describe("craftRawTransaction", () => {
    it("should throw when called", () => {
      expect(() => api.craftRawTransaction("tx", "sender", "pubkey", 1n)).toThrow(
        "craftRawTransaction is not supported",
      );
    });
  });

  describe("estimateFees", () => {
    it("should call estimateFees from logic and return FeeEstimation for non-ContractCall", async () => {
      // @ts-expect-error - testing with minimal required fields for TransactionIntent
      mockMapIntentToSDKOperation.mockReturnValue("CRYPTOTRANSFER");
      mockEstimateFees.mockResolvedValue({ tinybars: new BigNumber(5000) });

      // @ts-expect-error - testing with minimal required fields for TransactionIntent
      const txIntent: TransactionIntent<HederaMemo> = { recipient: "0.0.1234", amount: 100n };

      const result = await api.estimateFees(txIntent);

      expect(result).toEqual({ value: BigInt("5000") });
      expect(mockEstimateFees).toHaveBeenCalledWith(
        expect.objectContaining({ operationType: "CRYPTOTRANSFER" }),
      );
    });

    it("should pass txIntent in estimateFeesParams for ContractCall operation type", async () => {
      mockMapIntentToSDKOperation.mockReturnValue(HEDERA_OPERATION_TYPES.ContractCall);
      mockEstimateFees.mockResolvedValue({ tinybars: new BigNumber(9000) });

      // @ts-expect-error - testing with minimal required fields for TransactionIntent
      const txIntent: TransactionIntent<HederaMemo> = { recipient: "0.0.1234", amount: 100n };

      const result = await api.estimateFees(txIntent);

      expect(result).toEqual({ value: BigInt("9000") });
      expect(mockEstimateFees).toHaveBeenCalledWith(
        expect.objectContaining({
          operationType: HEDERA_OPERATION_TYPES.ContractCall,
          txIntent,
        }),
      );
    });

    it("carries the estimated gas limit for a ContractCall estimation", async () => {
      mockMapIntentToSDKOperation.mockReturnValue(HEDERA_OPERATION_TYPES.ContractCall);
      mockEstimateFees.mockResolvedValue({
        tinybars: new BigNumber(9000),
        gas: new BigNumber(250000),
      });

      // @ts-expect-error - testing with minimal required fields for TransactionIntent
      const txIntent: TransactionIntent<HederaMemo> = { recipient: "0.0.1234", amount: 100n };

      const result = await api.estimateFees(txIntent);

      expect(result).toEqual({
        value: BigInt("9000"),
        parameters: { gasLimit: BigInt("250000") },
      });
    });
  });

  describe("getBalance", () => {
    it("should call getBalance from logic", async () => {
      mockGetBalance.mockResolvedValue([{ value: 42n, asset: { type: "native" } }]);

      const result = await api.getBalance("0.0.1234");

      expect(mockGetBalance).toHaveBeenCalledTimes(1);
      expect(result).toEqual([{ value: 42n, asset: { type: "native" } }]);
    });

    it("should throw an exception when options is provided", async () => {
      await expect(
        api.getBalance("random address", {} as unknown as BalanceOptions),
      ).rejects.toThrow(InvalidParameterError);
    });
  });

  describe("lastBlock", () => {
    it("should call lastBlockV2 from logic", async () => {
      const mockBlock = { hash: "h", height: 1, time: new Date() };
      mockLastBlockV2.mockResolvedValue(mockBlock);

      const result = await api.lastBlock();

      expect(mockLastBlockV2).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockBlock);
    });
  });

  describe("getBlock", () => {
    it("should call getBlockV2 from logic", async () => {
      const mockBlock = { info: { hash: "h", height: 1, time: new Date() }, transactions: [] };
      mockGetBlockV2.mockResolvedValue(mockBlock);

      const result = await api.getBlock(1);

      expect(mockGetBlockV2).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockBlock);
    });
  });

  describe("getBlockInfo", () => {
    it("should call getBlockInfo from logic", async () => {
      const mockBlockInfo = { hash: "h", height: 5, time: new Date() };
      mockGetBlockInfo.mockResolvedValue(mockBlockInfo);

      const result = await api.getBlockInfo(5);

      expect(mockGetBlockInfo).toHaveBeenCalledTimes(1);
      expect(mockGetBlockInfo).toHaveBeenCalledWith(5);
      expect(result).toEqual(mockBlockInfo);
    });
  });

  describe("getValidators", () => {
    it("should call getValidators from logic", async () => {
      const mockValidators = { items: [], next: undefined };
      mockGetValidators.mockResolvedValue(mockValidators);

      const result = await api.getValidators("cursor");

      expect(mockGetValidators).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockValidators);
    });
  });

  describe("getStakes", () => {
    it("should call getStakes from logic", async () => {
      const mockStakes = {
        items: [
          {
            uid: "s1",
            amount: 100n,
            address: "0.0.1234",
            state: "active" as const,
            asset: { type: "native" as const },
            actions: [],
          },
        ],
      };
      mockGetStakes.mockResolvedValue(mockStakes);

      const result = await api.getStakes("0.0.1234");

      expect(mockGetStakes).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockStakes);
    });
  });

  describe("getRewards", () => {
    it("should call getRewards from logic", async () => {
      const mockRewards = {
        items: [
          { amount: 50n, receivedAt: new Date(), stake: "s1", asset: { type: "native" as const } },
        ],
      };
      mockGetRewards.mockResolvedValue(mockRewards);

      const result = await api.getRewards("0.0.1234", "cursor");

      expect(mockGetRewards).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockRewards);
    });
  });

  describe("listOperations", () => {
    const mockAddress = "0.0.1234";
    const mockFeesPayer = "0.0.111";
    const mockOptions = {
      limit: 10,
      order: "desc" as const,
      minHeight: 0,
    };
    const mockOperation = getMockedOperation({
      id: "op1",
      type: "IN",
      hash: "txhash",
      value: new BigNumber(100),
      fee: new BigNumber(10),
      extra: {
        transactionId: `${mockFeesPayer}-1234567890-1`,
      },
    });
    const mockTokenOperation = getMockedOperation({
      type: "OUT",
      contract: "0.0.555",
      standard: "erc20",
      value: new BigNumber(100),
    });
    const mockOperationOlder = getMockedOperation({
      id: "older",
      date: new Date("2024-01-01T00:00:01Z"),
      extra: { consensusTimestamp: "1000.0", transactionId: "0.0.111-1000.0" },
    });
    const mockOperationNewer = getMockedOperation({
      id: "newer",
      date: new Date("2024-01-01T00:00:02Z"),
      extra: { consensusTimestamp: "2000.0", transactionId: "0.0.111-2000.0" },
    });

    beforeEach(() => {
      mockExtractInitiator.mockReturnValue(mockFeesPayer);
      mockGetOperationValue.mockReturnValue(100n);
      mockToEVMAddress.mockResolvedValue("0xabc");
      mockGetAccountTokens.mockResolvedValue([]);
      mockGetERC20BalancesForAccountV2.mockResolvedValue([]);
    });

    it("accepts a non-zero minHeight and forwards a dotted nanosecond-precision cursor", async () => {
      mockGetDateRangeFromBlockHeight.mockReturnValue({
        start: new Date(420_000),
        end: new Date(430_000),
      });
      mockListOperationsV2.mockResolvedValue({
        coinOperations: [],
        tokenOperations: [],
        nextCursor: null,
      });

      const result = await api.listOperations(mockAddress, { ...mockOptions, minHeight: 42 });

      // The synthetic block preceding `minHeight` (the last known operation's own block) is
      // re-covered by the query rather than skipped: several operations can share that block
      // height, and starting the cursor exactly at `minHeight` would drop any of them that
      // happened after the last known one. See the "does not skip" test below for the case
      // this guards against.
      expect(mockGetDateRangeFromBlockHeight).toHaveBeenCalledWith(41);
      expect(mockListOperationsV2).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: "420.000000000" }),
      );

      // `getERC20Transfers` (network/hgraph.ts) builds its bigint cursor via
      // `timestamp?.replace(".", "")`, so the string must carry the dot and a
      // fixed 9-digit nanosecond part — a bare-seconds string (no dot) would
      // silently desync the hgraph cursor from real nanosecond-scale
      // `consensus_timestamp` values and break ERC20 incremental sync.
      const forwardedCursor = mockListOperationsV2.mock.calls[0][0].cursor;
      expect(forwardedCursor).toMatch(/^\d+\.\d{9}$/);

      expect(result).toHaveProperty("items");
    });

    it("does not skip operations sharing the last known operation's synthetic block", async () => {
      // Real `getDateRangeFromBlockHeight`, not the mock: a 10-second window, so block 41
      // covers seconds [410, 420) and block 42 covers [420, 430). The last known operation
      // landed at second 415 (block 41); a second, not-yet-synced operation at second 418
      // shares that same block. Starting the cursor at block 42 (the naive `minHeight`)
      // would exclude both; starting at block 41 (`minHeight - 1`) re-covers the block.
      const realGetDateRangeFromBlockHeight = jest.requireActual(
        "../logic/utils",
      ).getDateRangeFromBlockHeight;
      mockGetDateRangeFromBlockHeight.mockImplementation(realGetDateRangeFromBlockHeight);
      mockListOperationsV2.mockResolvedValue({
        coinOperations: [],
        tokenOperations: [],
        nextCursor: null,
      });

      await api.listOperations(mockAddress, { ...mockOptions, minHeight: 42 });

      const forwardedCursor: string | undefined = mockListOperationsV2.mock.calls[0][0].cursor;
      expect(forwardedCursor).not.toBeUndefined();
      // Block 41 starts at second 410, strictly before the not-yet-synced operation's
      // second-418 timestamp, so a mirror-node query from this cursor still returns it.
      expect(Number(forwardedCursor?.split(".")[0])).toBeLessThanOrEqual(418);
    });

    it("should return mapped coin-framework operations with correct shape", async () => {
      mockListOperationsV2.mockResolvedValue({
        coinOperations: [mockOperation],
        tokenOperations: [],
        nextCursor: "next123",
      });

      const result = await api.listOperations(mockAddress, mockOptions);

      expect(mockListOperationsV2).toHaveBeenCalledTimes(1);
      expect(result.next).toBe("next123");
      expect(result.items).toEqual([
        expect.objectContaining({
          id: "op1",
          type: "IN",
          asset: { type: "native" },
          value: BigInt(mockOperation.value.toString()),
          tx: expect.objectContaining({
            hash: mockOperation.hash,
            fees: BigInt(mockOperation.fee.toString()),
            feesPayer: mockFeesPayer,
            failed: false,
          }),
        }),
      ]);
    });

    it("should map token operation contract to token asset and include assetAmount in details", async () => {
      mockListOperationsV2.mockResolvedValue({
        coinOperations: [],
        tokenOperations: [mockTokenOperation],
        nextCursor: null,
      });

      const result = await api.listOperations(mockAddress, mockOptions);

      expect(result.items[0].details).toMatchObject({
        assetAmount: mockTokenOperation.value.toFixed(0),
      });
      expect(result.items[0].asset).toEqual({
        type: mockTokenOperation.standard,
        assetReference: mockTokenOperation.contract,
        assetOwner: mockAddress,
      });
    });

    it("should include stakedAmount in details when present in extra", async () => {
      mockListOperationsV2.mockResolvedValue({
        coinOperations: [
          getMockedOperation({
            extra: { stakedAmount: new BigNumber(200) },
          }),
        ],
        tokenOperations: [],
        nextCursor: null,
      });

      const result = await api.listOperations(mockAddress, mockOptions);

      expect(result.items[0].details).toMatchObject({ stakedAmount: 200n });
    });

    it("should omit feesPayer when transactionId is absent", async () => {
      const mockOperationWithoutTransactionId = getMockedOperation({
        extra: {},
      });

      mockListOperationsV2.mockResolvedValue({
        coinOperations: [mockOperationWithoutTransactionId],
        tokenOperations: [],
        nextCursor: null,
      });

      const result = await api.listOperations(mockAddress, mockOptions);

      expect(mockExtractInitiator).not.toHaveBeenCalled();
      expect(result.items[0].tx).not.toHaveProperty("feesPayer");
    });

    it("should prefer feesPayer from operation extra over transactionId", async () => {
      const explicitFeesPayer = "0.0.9999";
      const operationWithExplicitFeesPayer = getMockedOperation({
        extra: {
          transactionId: "0.0.111-1234567890-1",
          feePayer: explicitFeesPayer,
        },
      });

      mockListOperationsV2.mockResolvedValue({
        coinOperations: [operationWithExplicitFeesPayer],
        tokenOperations: [],
        nextCursor: null,
      });

      const result = await api.listOperations(mockAddress, mockOptions);

      expect(mockExtractInitiator).not.toHaveBeenCalled();
      expect(result.items[0].tx.feesPayer).toBe(explicitFeesPayer);
    });

    it.each([
      ["desc" as const, [mockOperationOlder], [mockOperationNewer]],
      ["asc" as const, [mockOperationNewer], [mockOperationOlder]],
    ])("should sort by consensusTimestamp %s", async (order, coinOps, tokenOps) => {
      mockListOperationsV2.mockResolvedValue({
        coinOperations: coinOps,
        tokenOperations: tokenOps,
        nextCursor: null,
      });

      const result = await api.listOperations(mockAddress, { ...mockOptions, order });

      const newId = mockOperationNewer.id;
      const oldId = mockOperationOlder.id;

      expect(result.items[0].id).toEqual(order === "desc" ? newId : oldId);
      expect(result.items[1].id).toEqual(order === "desc" ? oldId : newId);
    });

    it("should fall back to date sort when consensusTimestamp is missing", async () => {
      mockListOperationsV2.mockResolvedValue({
        coinOperations: [{ ...mockOperationOlder, extra: {} }],
        tokenOperations: [{ ...mockOperationNewer, extra: {} }],
        nextCursor: null,
      });

      const result = await api.listOperations(mockAddress, { ...mockOptions, order: "desc" });

      expect(result.items[0].id).toBe(mockOperationNewer.id);
      expect(result.items[1].id).toBe(mockOperationOlder.id);
    });

    it("should return undefined next when nextCursor is null", async () => {
      mockListOperationsV2.mockResolvedValue({
        coinOperations: [],
        tokenOperations: [],
        nextCursor: null,
      });

      const result = await api.listOperations(mockAddress, mockOptions);

      expect(result.next).toBeUndefined();
    });

    it("should use HARDCODED_BLOCK_HEIGHT and getBlockHash when blockHeight is missing", async () => {
      mockListOperationsV2.mockResolvedValue({
        coinOperations: [mockOperation],
        tokenOperations: [],
        nextCursor: null,
      });

      const result = await api.listOperations(mockAddress, mockOptions);

      expect(mockListOperationsV2).toHaveBeenCalledTimes(1);
      expect(logicUtils.getBlockHash).toHaveBeenCalledTimes(1);
      expect(result.items[0].tx.block.height).toEqual(HARDCODED_BLOCK_HEIGHT);
    });

    it("should throw when evm address is missing", async () => {
      mockToEVMAddress.mockResolvedValue(null);

      await expect(api.listOperations(mockAddress, mockOptions)).rejects.toThrow(
        "hedera: evm address is missing",
      );
    });
  });

  describe("validateIntent", () => {
    it("should call validateIntent from logic and return its result", async () => {
      const mockValidateIntent = jest.mocked(logic.validateIntent);
      const validation = {
        errors: {},
        warnings: {},
        estimatedFees: 50n,
        amount: 100n,
        totalSpent: 150n,
      };
      mockValidateIntent.mockResolvedValue(validation);

      // @ts-expect-error - testing with minimal required fields for TransactionIntent
      const txIntent: TransactionIntent<HederaMemo> = { recipient: "0.0.1234", amount: 100n };
      const balances = [{ value: 1_000n, locked: 0n, asset: { type: "native" as const } }];

      const result = await api.validateIntent(txIntent, balances, undefined);

      expect(mockValidateIntent).toHaveBeenCalledWith(
        expect.objectContaining({ status: { type: "active" } }),
        mockCurrency.id,
        txIntent,
        balances,
        undefined,
      );
      expect(result).toBe(validation);
    });
  });

  describe("getNextSequence", () => {
    it("should throw when called", async () => {
      await expect(api.getNextSequence("0.0.1234")).rejects.toThrow(
        "getNextSequence is not supported",
      );
    });
  });
});
