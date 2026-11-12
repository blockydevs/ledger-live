import { PROGRAM_ID, TOKEN_RECORD_NAME } from "../constants";
import { sdkClient } from "../network/sdk";
import { fetchAllOwnedRecords } from "../network/utils";
import { getMockedConfig } from "../__tests__/fixtures/config.fixture";
import { getMockedDecryptedRecord, getMockedRecord } from "../__tests__/fixtures/api.fixture";
import { resolvePrivateRecords, selectPrivateRecords } from "./privateRecords";

jest.mock("../network/sdk");
jest.mock("../network/utils", () => ({
  ...jest.requireActual("../network/utils"),
  fetchAllOwnedRecords: jest.fn(),
}));

const mockFetchAllOwnedRecords = jest.mocked(fetchAllOwnedRecords);
const mockDecryptRecord = jest.mocked(sdkClient.decryptRecord);

const TOKEN_PROGRAM_ID = "token_a.aleo";
const config = getMockedConfig("mainnet");
const privacyParams = {
  config,
  provableId: "provable-id-1",
  viewKey: "AViewKey1mock",
};

const amountByCiphertext = new Map<string, number>();

function makeUnspentRecord(commitment: string, amount: number, programName = PROGRAM_ID.CREDITS) {
  const isCreditsRecord = programName === PROGRAM_ID.CREDITS;
  const record = getMockedRecord({
    commitment,
    program_name: programName,
    record_name: isCreditsRecord ? "credits" : TOKEN_RECORD_NAME,
    record_ciphertext: `ciphertext-${commitment}`,
  });
  amountByCiphertext.set(record.record_ciphertext, amount);

  return record;
}

function makeDecryptedRecord(ciphertext: string) {
  return getMockedDecryptedRecord({
    data: { microcredits: `${amountByCiphertext.get(ciphertext)}u64.private` },
  });
}

describe("privateRecords", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    amountByCiphertext.clear();
    mockDecryptRecord.mockImplementation(async params => makeDecryptedRecord(params.ciphertext));
  });

  describe("selectPrivateRecords", () => {
    it("fetches the unspent records of every program from the scanner", async () => {
      mockFetchAllOwnedRecords.mockResolvedValue([
        makeUnspentRecord("a", 1000),
        makeUnspentRecord("c", 50),
      ]);

      await selectPrivateRecords({
        ...privacyParams,
        programId: PROGRAM_ID.CREDITS,
        amount: 500n,
        fee: 40n,
      });

      expect(mockFetchAllOwnedRecords).toHaveBeenCalledTimes(1);
      expect(mockFetchAllOwnedRecords).toHaveBeenCalledWith({
        config,
        uuid: "provable-id-1",
        unspent: true,
        programs: [],
        functions: [],
      });
    });

    it("native: picks the fee record outside the amount records", async () => {
      mockFetchAllOwnedRecords.mockResolvedValue([
        makeUnspentRecord("a", 600),
        makeUnspentRecord("b", 1000),
      ]);

      await expect(
        selectPrivateRecords({
          ...privacyParams,
          programId: PROGRAM_ID.CREDITS,
          amount: 500n,
          fee: 40n,
        }),
      ).resolves.toEqual({ recordCommitments: ["a"], feeRecordCommitment: "b" });
    });

    it("token: picks amount records among the Token records of the token program and the fee record from credits", async () => {
      mockFetchAllOwnedRecords.mockResolvedValue([
        makeUnspentRecord("credits-large", 450),
        makeUnspentRecord("credits-small", 50),
        makeUnspentRecord("token", 500, TOKEN_PROGRAM_ID),
        makeUnspentRecord("other-token", 900, "token_b.aleo"),
        { ...makeUnspentRecord("token-receipt", 450, TOKEN_PROGRAM_ID), record_name: "Receipt" },
      ]);

      await expect(
        selectPrivateRecords({
          ...privacyParams,
          programId: TOKEN_PROGRAM_ID,
          amount: 400n,
          fee: 40n,
        }),
      ).resolves.toEqual({ recordCommitments: ["token"], feeRecordCommitment: "credits-small" });
    });

    it("sponsored fees: returns no fee record and decrypts only the amount records", async () => {
      mockFetchAllOwnedRecords.mockResolvedValue([
        makeUnspentRecord("credits", 1000),
        makeUnspentRecord("token", 500, TOKEN_PROGRAM_ID),
      ]);

      await expect(
        selectPrivateRecords({
          ...privacyParams,
          programId: TOKEN_PROGRAM_ID,
          amount: 400n,
          fee: null,
        }),
      ).resolves.toEqual({ recordCommitments: ["token"] });
      expect(mockDecryptRecord).toHaveBeenCalledTimes(1);
      expect(mockDecryptRecord).toHaveBeenCalledWith({
        config,
        viewKey: "AViewKey1mock",
        ciphertext: "ciphertext-token",
      });
    });

    it("native: spends up to 14 records", async () => {
      const commitments = Array.from({ length: 14 }, (_, index) => `record-${index}`);
      mockFetchAllOwnedRecords.mockResolvedValue(
        commitments.map(commitment => makeUnspentRecord(commitment, 100)),
      );

      await expect(
        selectPrivateRecords({
          ...privacyParams,
          programId: PROGRAM_ID.CREDITS,
          amount: 1400n,
          fee: null,
        }),
      ).resolves.toEqual({ recordCommitments: commitments });
    });

    it("token: throws when the amount needs more than 13 records", async () => {
      const commitments = Array.from({ length: 14 }, (_, index) => `record-${index}`);
      mockFetchAllOwnedRecords.mockResolvedValue(
        commitments.map(commitment => makeUnspentRecord(commitment, 100, TOKEN_PROGRAM_ID)),
      );

      await expect(
        selectPrivateRecords({
          ...privacyParams,
          programId: TOKEN_PROGRAM_ID,
          amount: 1400n,
          fee: null,
        }),
      ).rejects.toThrow("aleo: no private records cover the amount of 1400");
    });

    it("throws for a zero amount before fetching any record", async () => {
      await expect(
        selectPrivateRecords({
          ...privacyParams,
          programId: PROGRAM_ID.CREDITS,
          amount: 0n,
          fee: 40n,
        }),
      ).rejects.toThrow("aleo: amount must be positive to select records, got 0");
      expect(mockFetchAllOwnedRecords).not.toHaveBeenCalled();
    });

    it("throws when the records do not cover the amount", async () => {
      mockFetchAllOwnedRecords.mockResolvedValue([makeUnspentRecord("a", 100)]);

      await expect(
        selectPrivateRecords({
          ...privacyParams,
          programId: PROGRAM_ID.CREDITS,
          amount: 500n,
          fee: 40n,
        }),
      ).rejects.toThrow("aleo: no private records cover the amount of 500");
    });

    it("throws when no record left covers the fee", async () => {
      mockFetchAllOwnedRecords.mockResolvedValue([
        makeUnspentRecord("a", 1000),
        makeUnspentRecord("b", 10),
      ]);

      await expect(
        selectPrivateRecords({
          ...privacyParams,
          programId: PROGRAM_ID.CREDITS,
          amount: 500n,
          fee: 40n,
        }),
      ).rejects.toThrow("aleo: no private record covers the fee of 40");
    });
  });

  describe("resolvePrivateRecords", () => {
    it("decrypts only the records behind the commitments, in the given order", async () => {
      mockFetchAllOwnedRecords.mockResolvedValue([
        makeUnspentRecord("a", 1000),
        makeUnspentRecord("b", 300),
        makeUnspentRecord("c", 50),
      ]);

      await expect(
        resolvePrivateRecords({
          ...privacyParams,
          programId: PROGRAM_ID.CREDITS,
          commitments: ["c", "a"],
        }),
      ).resolves.toEqual([
        makeDecryptedRecord("ciphertext-c"),
        makeDecryptedRecord("ciphertext-a"),
      ]);
      expect(mockDecryptRecord).toHaveBeenCalledTimes(2);
      expect(mockDecryptRecord).toHaveBeenCalledWith(
        expect.objectContaining({ ciphertext: "ciphertext-c" }),
      );
      expect(mockDecryptRecord).toHaveBeenCalledWith(
        expect.objectContaining({ ciphertext: "ciphertext-a" }),
      );
    });

    it("throws on commitments that are spent or belong to another program, before decrypting", async () => {
      mockFetchAllOwnedRecords.mockResolvedValue([
        makeUnspentRecord("a", 1000),
        makeUnspentRecord("token", 500, TOKEN_PROGRAM_ID),
      ]);

      await expect(
        resolvePrivateRecords({
          ...privacyParams,
          programId: PROGRAM_ID.CREDITS,
          commitments: ["a", "spent", "token"],
        }),
      ).rejects.toThrow("aleo: no unspent credits.aleo records for: spent, token");
      expect(mockDecryptRecord).not.toHaveBeenCalled();
    });

    it("token: throws on a commitment of a record that is not a Token record", async () => {
      mockFetchAllOwnedRecords.mockResolvedValue([
        makeUnspentRecord("token", 500, TOKEN_PROGRAM_ID),
        { ...makeUnspentRecord("token-receipt", 450, TOKEN_PROGRAM_ID), record_name: "Receipt" },
      ]);

      await expect(
        resolvePrivateRecords({
          ...privacyParams,
          programId: TOKEN_PROGRAM_ID,
          commitments: ["token", "token-receipt"],
        }),
      ).rejects.toThrow(`aleo: no unspent ${TOKEN_PROGRAM_ID} records for: token-receipt`);
    });
  });
});
