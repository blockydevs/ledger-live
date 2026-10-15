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
import { resolveRecords } from "./resolveRecords";

jest.mock("../network/utils", () => ({
  ...jest.requireActual("../network/utils"),
  fetchAllOwnedRecords: jest.fn(),
  getRecordScannerStatusOrThrow: jest.fn(),
  decryptRecordAmount: jest.fn(),
}));

const mockFetchAllOwnedRecords = jest.mocked(fetchAllOwnedRecords);
const mockDecrypt = jest.mocked(decryptRecordAmount);
const config = getMockedConfig("testnet");
const TOKEN = "token_b.aleo";

const a = getMockedRecord({ commitment: "a" });
const b = getMockedRecord({ commitment: "b" });
const c = getMockedRecord({ commitment: "c" });
const t = getMockedRecord({ commitment: "t", program_name: TOKEN, record_name: "Token" });
const amounts: Record<string, number> = { a: 100, b: 200, c: 300, t: 50 };

const args = {
  config,
  provableId: "uuid",
  viewKey: "vk",
  pool: { type: "native" as const },
  maxRecords: 14,
};

describe("resolveRecords", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getRecordScannerStatusOrThrow).mockResolvedValue(getMockedRecordScannerStatus());
    mockFetchAllOwnedRecords.mockResolvedValue([a, b, c, t]);
    mockDecrypt.mockImplementation(async (_c, _v, record) => ({
      amount: new BigNumber(amounts[record.commitment]),
      details: getMockedDecryptedRecord({ nonce: record.commitment }),
    }));
  });

  it("returns records in the order of the commitments, with their total", async () => {
    const result = await resolveRecords({ ...args, commitments: ["c", "a"] });

    expect(result.records.map(r => r.nonce)).toEqual(["c", "a"]);
    expect(result.total).toEqual(new BigNumber(400));
  });

  it("decrypts only the matched records", async () => {
    await resolveRecords({ ...args, commitments: ["b"] });

    expect(mockDecrypt).toHaveBeenCalledTimes(1);
    expect(mockDecrypt.mock.calls[0][2]).toBe(b);
  });

  it("lists a missing commitment in the error", async () => {
    await expect(resolveRecords({ ...args, commitments: ["a", "gone"] })).rejects.toThrow(
      "aleo: no amount records found for given commitments: gone",
    );
  });

  it("treats a token commitment as missing from the native pool", async () => {
    await expect(resolveRecords({ ...args, commitments: ["t"] })).rejects.toThrow(
      "aleo: no amount records found for given commitments: t",
    );
  });

  it("resolves a token commitment from the token pool", async () => {
    const result = await resolveRecords({
      ...args,
      pool: { type: "token", programId: TOKEN },
      maxRecords: 13,
      commitments: ["t"],
    });
    expect(result.total).toEqual(new BigNumber(50));
  });

  it("rejects more commitments than the cap before any network call", async () => {
    await expect(
      resolveRecords({ ...args, maxRecords: 1, commitments: ["a", "b"] }),
    ).rejects.toThrow("aleo: too many amount records selected (max: 1)");
    expect(mockFetchAllOwnedRecords).not.toHaveBeenCalled();
    expect(mockDecrypt).not.toHaveBeenCalled();
  });

  it("rejects an empty commitment list before any network call", async () => {
    await expect(resolveRecords({ ...args, commitments: [] })).rejects.toThrow(
      "aleo: missing amount record commitments",
    );
    expect(mockFetchAllOwnedRecords).not.toHaveBeenCalled();
  });

  it("rejects duplicate commitments before any network call", async () => {
    await expect(resolveRecords({ ...args, commitments: ["a", "a"] })).rejects.toThrow(
      "aleo: duplicate record commitments: a",
    );
    expect(mockFetchAllOwnedRecords).not.toHaveBeenCalled();
  });
});
