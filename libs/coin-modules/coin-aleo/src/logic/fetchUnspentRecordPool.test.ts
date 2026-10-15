import BigNumber from "bignumber.js";
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
import { decryptUnspentRecords, fetchUnspentRecordPool } from "./fetchUnspentRecordPool";

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

const native1 = getMockedRecord({ commitment: "n1", block_height: 100 });
const nativeAboveSync = getMockedRecord({ commitment: "n2", block_height: 501 });
const token1 = getMockedRecord({ commitment: "t1", program_name: TOKEN, record_name: "Token" });
const otherToken = getMockedRecord({
  commitment: "t2",
  program_name: "other.aleo",
  record_name: "Token",
});
const nonTokenOfTokenProgram = getMockedRecord({
  commitment: "t3",
  program_name: TOKEN,
  record_name: "Receipt",
});

describe("fetchUnspentRecordPool", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStatus.mockResolvedValue(getMockedRecordScannerStatus({ synced_up_to: 500 }));
    mockFetchAllOwnedRecords.mockResolvedValue([
      native1,
      nativeAboveSync,
      token1,
      otherToken,
      nonTokenOfTokenProgram,
    ]);
  });

  it("asks the scanner for every unspent record, with empty program and function filters", async () => {
    await fetchUnspentRecordPool({ config, provableId: "uuid" });

    expect(mockGetStatus).toHaveBeenCalledWith(config, "uuid");
    expect(mockFetchAllOwnedRecords).toHaveBeenCalledTimes(1);
    expect(mockFetchAllOwnedRecords).toHaveBeenCalledWith({
      config,
      uuid: "uuid",
      unspent: true,
      programs: [],
      functions: [],
    });
  });

  it("drops records above synced_up_to and splits native from the token program", async () => {
    const pool = await fetchUnspentRecordPool({ config, provableId: "uuid", programId: TOKEN });

    expect(pool.nativeRecords).toEqual([native1]);
    expect(pool.tokenRecords).toEqual([token1]);
  });

  it("returns no token records when no programId is given", async () => {
    const pool = await fetchUnspentRecordPool({ config, provableId: "uuid" });
    expect(pool.tokenRecords).toEqual([]);
  });

  it("keeps every record when synced_up_to is null", async () => {
    mockGetStatus.mockResolvedValue(getMockedRecordScannerStatus({ synced_up_to: null }));
    const pool = await fetchUnspentRecordPool({ config, provableId: "uuid" });
    expect(pool.nativeRecords).toEqual([native1, nativeAboveSync]);
  });

  it("propagates a scanner error", async () => {
    mockGetStatus.mockRejectedValue(new Error("scanner down"));
    await expect(fetchUnspentRecordPool({ config, provableId: "uuid" })).rejects.toThrow(
      "scanner down",
    );
  });
});

describe("decryptUnspentRecords", () => {
  it("decrypts each record once and keeps input order", async () => {
    const details = getMockedDecryptedRecord();
    mockDecrypt.mockImplementation(async (_c, _v, record) => ({
      amount: new BigNumber(record.commitment === "n1" ? 800000 : 600000),
      details,
    }));
    const second = getMockedRecord({ commitment: "n9" });

    const result = await decryptUnspentRecords({
      config,
      viewKey: "vk",
      records: [native1, second],
    });

    expect(mockDecrypt).toHaveBeenCalledTimes(2);
    expect(mockDecrypt).toHaveBeenCalledWith(config, "vk", native1);
    expect(result).toEqual([
      { ...native1, microcredits: "800000", decryptedData: details },
      { ...second, microcredits: "600000", decryptedData: details },
    ]);
  });
});
