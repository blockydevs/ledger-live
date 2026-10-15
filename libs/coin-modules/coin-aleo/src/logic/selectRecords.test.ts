import BigNumber from "bignumber.js";
import { NotEnoughBalance } from "@ledgerhq/ledger-wallet-framework/errors";
import { MAX_PRIVATE_RECORDS_PER_TRANSACTION, TRANSACTION_TYPE } from "../constants";
import { AleoAmountTooLargeForTransaction, AleoFeeRecordRequired } from "../errors";
import { getMockedConfig } from "../__tests__/fixtures/config.fixture";
import {
  getMockedDecryptedRecord,
  getMockedRecord,
  getMockedRecordScannerStatus,
} from "../__tests__/fixtures/api.fixture";
import {
  decryptRecordAmount,
  fetchAllOwnedRecords,
  getRecordScannerStatusOrThrow,
} from "../network/utils";
import type { AleoPrivateRecord } from "../types";
import { selectRecords } from "./selectRecords";

jest.mock("../network/utils", () => ({
  ...jest.requireActual("../network/utils"),
  fetchAllOwnedRecords: jest.fn(),
  getRecordScannerStatusOrThrow: jest.fn(),
  decryptRecordAmount: jest.fn(),
}));

const mockFetchAllOwnedRecords = jest.mocked(fetchAllOwnedRecords);
const mockGetStatus = jest.mocked(getRecordScannerStatusOrThrow);
const mockDecrypt = jest.mocked(decryptRecordAmount);

const config = getMockedConfig("testnet");
const TOKEN = "token_b.aleo";
const amounts = new Map<string, number>();

function native(commitment: string, amount: number): AleoPrivateRecord {
  amounts.set(commitment, amount);
  return getMockedRecord({ commitment, record_ciphertext: `ct-${commitment}` });
}
function token(commitment: string, amount: number): AleoPrivateRecord {
  amounts.set(commitment, amount);
  return getMockedRecord({
    commitment,
    record_ciphertext: `ct-${commitment}`,
    program_name: TOKEN,
    record_name: "Token",
  });
}

const baseArgs = {
  config,
  provableId: "uuid",
  viewKey: "vk",
  type: TRANSACTION_TYPE.TRANSFER_PRIVATE,
  fee: 2308n,
  isFeeSponsored: false,
} as const;

describe("selectRecords", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    amounts.clear();
    mockGetStatus.mockResolvedValue(getMockedRecordScannerStatus());
    mockDecrypt.mockImplementation(async (_c, _v, record) => ({
      amount: new BigNumber(amounts.get(record.commitment) ?? 0),
      details: getMockedDecryptedRecord({ nonce: record.commitment }),
    }));
  });

  it("picks the smallest covering native record and a separate fee record", async () => {
    mockFetchAllOwnedRecords.mockResolvedValue([
      native("a", 800000),
      native("b", 600000),
      native("f", 5000),
    ]);

    const result = await selectRecords({ ...baseArgs, amount: 500000n });

    expect(result.amountRecords.map(r => r.commitment)).toEqual(["b"]);
    expect(result.feeRecord?.commitment).toBe("f");
  });

  it("selects several native records and keeps the fee record outside the selection", async () => {
    mockFetchAllOwnedRecords.mockResolvedValue([
      native("a", 800000),
      native("b", 600000),
      native("f", 5000),
    ]);

    const result = await selectRecords({ ...baseArgs, amount: 1_200_000n });

    expect(result.amountRecords.map(r => r.commitment)).toEqual(["a", "b"]);
    expect(result.feeRecord?.commitment).toBe("f");
  });

  it("selects token records and takes the fee from credits.aleo", async () => {
    mockFetchAllOwnedRecords.mockResolvedValue([
      token("t1", 100),
      token("t2", 50),
      native("f", 5000),
    ]);

    const result = await selectRecords({
      ...baseArgs,
      type: TRANSACTION_TYPE.TRANSFER_TOKEN_PRIVATE,
      programId: TOKEN,
      amount: 120n,
    });

    expect(result.amountRecords.map(r => r.commitment)).toEqual(["t1", "t2"]);
    expect(result.feeRecord?.commitment).toBe("f");
  });

  it("picks no fee record and never decrypts the native pool for a sponsored token action", async () => {
    mockFetchAllOwnedRecords.mockResolvedValue([token("t1", 100), native("f", 5000)]);

    const result = await selectRecords({
      ...baseArgs,
      type: TRANSACTION_TYPE.TRANSFER_TOKEN_PRIVATE,
      programId: TOKEN,
      amount: 100n,
      isFeeSponsored: true,
    });

    expect(result.feeRecord).toBeNull();
    expect(mockDecrypt).toHaveBeenCalledTimes(1);
    expect(mockDecrypt.mock.calls[0][2].commitment).toBe("t1");
  });

  it("decrypts each pool record exactly once", async () => {
    mockFetchAllOwnedRecords.mockResolvedValue([
      native("a", 800000),
      native("b", 600000),
      native("f", 5000),
    ]);

    await selectRecords({ ...baseArgs, amount: 500000n });

    expect(mockDecrypt).toHaveBeenCalledTimes(3);
  });

  it("throws NotEnoughBalance for an empty pool", async () => {
    mockFetchAllOwnedRecords.mockResolvedValue([]);
    await expect(selectRecords({ ...baseArgs, amount: 1n })).rejects.toThrow(NotEnoughBalance);
  });

  it("throws NotEnoughBalance when the pool sums below the amount", async () => {
    mockFetchAllOwnedRecords.mockResolvedValue([native("a", 10), native("b", 10)]);
    await expect(selectRecords({ ...baseArgs, amount: 21n })).rejects.toThrow(NotEnoughBalance);
  });

  it("throws AleoAmountTooLargeForTransaction when funds exist past the record cap", async () => {
    const records = Array.from({ length: MAX_PRIVATE_RECORDS_PER_TRANSACTION + 1 }, (_, i) =>
      native(`r${i}`, 10),
    );
    mockFetchAllOwnedRecords.mockResolvedValue(records);

    await expect(selectRecords({ ...baseArgs, amount: 150n })).rejects.toThrow(
      AleoAmountTooLargeForTransaction,
    );
  });

  it("throws AleoFeeRecordRequired when no record left covers the fee", async () => {
    mockFetchAllOwnedRecords.mockResolvedValue([native("a", 800000), native("tiny", 10)]);
    await expect(selectRecords({ ...baseArgs, amount: 500000n })).rejects.toThrow(
      AleoFeeRecordRequired,
    );
  });

  it.each([0n, -1n])("rejects amount %s before any network call", async amount => {
    await expect(selectRecords({ ...baseArgs, amount })).rejects.toThrow(
      "aleo: amount must be positive",
    );
    expect(mockFetchAllOwnedRecords).not.toHaveBeenCalled();
  });

  it("rejects a token action without programId before any network call", async () => {
    await expect(
      selectRecords({ ...baseArgs, type: TRANSACTION_TYPE.TRANSFER_TOKEN_PRIVATE, amount: 1n }),
    ).rejects.toThrow("aleo: programId is required for transfer_token_private");
    expect(mockFetchAllOwnedRecords).not.toHaveBeenCalled();
  });
});
