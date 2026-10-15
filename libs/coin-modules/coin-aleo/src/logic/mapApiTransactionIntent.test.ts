import { TRANSACTION_TYPE } from "../constants";
import { getMockedDecryptedRecord } from "../__tests__/fixtures/api.fixture";
import { MOCK_MULTI_RECORD_TVKS } from "../__tests__/fixtures/transaction.fixture";
import type { AleoApiTransactionIntent } from "../types";
import {
  getPrivateRootApiData,
  mapPrivateFeeApiIntent,
  mapPrivateRootApiIntent,
  mapPublicApiIntent,
} from "./mapApiTransactionIntent";

const base = {
  intentType: "transaction",
  asset: { type: "native" },
  sender: "aleo1sender",
  recipient: "aleo1recipient",
  amount: 200n,
} as const;

const record1 = getMockedDecryptedRecord();
const record2 = getMockedDecryptedRecord({ data: { microcredits: "600000u64.private" } });

describe("getPrivateRootApiData", () => {
  it("returns null for a public type", () => {
    expect(getPrivateRootApiData({ ...base, type: TRANSACTION_TYPE.TRANSFER_PUBLIC })).toBeNull();
  });

  it("returns the data of a private type, with or without commitments", () => {
    const data = { type: TRANSACTION_TYPE.TRANSFER_PRIVATE } as const;
    expect(getPrivateRootApiData({ ...base, type: TRANSACTION_TYPE.TRANSFER_PRIVATE, data })).toBe(
      data,
    );
  });

  it("throws when a private type has no data", () => {
    const intent = { ...base, type: TRANSACTION_TYPE.TRANSFER_PRIVATE } as AleoApiTransactionIntent;
    expect(() => getPrivateRootApiData(intent)).toThrow(
      "aleo: intent data is required for transfer_private",
    );
  });

  it("throws when data.type differs from the intent type", () => {
    const intent: AleoApiTransactionIntent = {
      ...base,
      type: TRANSACTION_TYPE.TRANSFER_PRIVATE,
      data: { type: TRANSACTION_TYPE.CONVERT_PRIVATE_TO_PUBLIC },
    };
    expect(() => getPrivateRootApiData(intent)).toThrow(
      "aleo: intent data is required for transfer_private",
    );
  });
});

describe("mapPrivateRootApiIntent", () => {
  it("maps a native private intent to a logic intent with records and tvks", () => {
    const intent: AleoApiTransactionIntent = {
      ...base,
      type: TRANSACTION_TYPE.TRANSFER_PRIVATE,
      data: {
        type: TRANSACTION_TYPE.TRANSFER_PRIVATE,
        recordCommitments: ["c1", "c2"],
        tvks: MOCK_MULTI_RECORD_TVKS,
      },
    };

    expect(mapPrivateRootApiIntent(intent, [record1, record2])).toEqual({
      ...base,
      type: TRANSACTION_TYPE.TRANSFER_PRIVATE,
      data: {
        type: TRANSACTION_TYPE.TRANSFER_PRIVATE,
        records: [record1, record2],
        tvks: MOCK_MULTI_RECORD_TVKS,
      },
    });
  });

  it("keeps programId on a token intent and defaults tvks to []", () => {
    const intent: AleoApiTransactionIntent = {
      ...base,
      type: TRANSACTION_TYPE.TRANSFER_TOKEN_PRIVATE,
      data: {
        type: TRANSACTION_TYPE.TRANSFER_TOKEN_PRIVATE,
        programId: "token_b.aleo",
        recordCommitments: ["c1"],
      },
    };

    expect(mapPrivateRootApiIntent(intent, [record1])).toEqual({
      ...base,
      type: TRANSACTION_TYPE.TRANSFER_TOKEN_PRIVATE,
      data: {
        type: TRANSACTION_TYPE.TRANSFER_TOKEN_PRIVATE,
        programId: "token_b.aleo",
        records: [record1],
        tvks: [],
      },
    });
  });

  it("throws for a public intent", () => {
    expect(() =>
      mapPrivateRootApiIntent({ ...base, type: TRANSACTION_TYPE.TRANSFER_PUBLIC }, [record1]),
    ).toThrow("aleo: transfer_public is not a private root intent");
  });
});

describe("mapPrivateFeeApiIntent", () => {
  it("replaces recordCommitment with the decrypted record", () => {
    const intent: AleoApiTransactionIntent = {
      ...base,
      type: "fee_private",
      data: { type: "fee_private", executionId: "1field", priorityFee: 5n, recordCommitment: "c9" },
    };

    expect(mapPrivateFeeApiIntent(intent, record1)).toEqual({
      ...base,
      type: "fee_private",
      data: { type: "fee_private", executionId: "1field", priorityFee: 5n, record: record1 },
    });
  });

  it("throws for any other intent", () => {
    const intent = { ...base, type: "fee_public" } as AleoApiTransactionIntent;
    expect(() => mapPrivateFeeApiIntent(intent, record1)).toThrow(
      "aleo: intent data is required for fee_private",
    );
  });
});

describe("mapPublicApiIntent", () => {
  it("passes a public intent through unchanged, including unbond_public without data", () => {
    const unbond: AleoApiTransactionIntent = {
      ...base,
      recipient: base.sender,
      type: TRANSACTION_TYPE.UNBOND_PUBLIC,
    };
    expect(mapPublicApiIntent(unbond)).toEqual(unbond);
  });

  it("passes fee_public through unchanged", () => {
    const fee: AleoApiTransactionIntent = {
      ...base,
      type: "fee_public",
      data: { type: "fee_public", executionId: "1field" },
    };
    expect(mapPublicApiIntent(fee)).toEqual(fee);
  });

  it.each([TRANSACTION_TYPE.TRANSFER_PRIVATE, "fee_private"])(
    "throws for %s, which needs records",
    type => {
      expect(() => mapPublicApiIntent({ ...base, type } as AleoApiTransactionIntent)).toThrow(
        `aleo: ${type} needs records and cannot map without them`,
      );
    },
  );

  it("throws for a public type that carries private root data", () => {
    const intent: AleoApiTransactionIntent = {
      ...base,
      type: TRANSACTION_TYPE.TRANSFER_PUBLIC,
      data: { type: TRANSACTION_TYPE.TRANSFER_PRIVATE, recordCommitments: ["a"] },
    };
    expect(() => mapPublicApiIntent(intent)).toThrow(
      "aleo: transfer_public needs records and cannot map without them",
    );
  });
});
