import BigNumber from "bignumber.js";
import aleoConfig from "../config";
import { TRANSACTION_TYPE } from "../constants";
import { prepareTransaction } from "../bridge/prepareTransaction";
import { getMockedAccount } from "../__tests__/fixtures/account.fixture";
import { getMockedConfig } from "../__tests__/fixtures/config.fixture";
import { getMockedTransaction } from "../__tests__/fixtures/transaction.fixture";
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
import type { AleoUnspentRecord, TransactionPrivate } from "../types";
import { estimateFees } from "./estimateFees";
import { selectRecords } from "./selectRecords";

jest.mock("../config");
jest.mock("../network/utils", () => ({
  ...jest.requireActual("../network/utils"),
  fetchAllOwnedRecords: jest.fn(),
  getRecordScannerStatusOrThrow: jest.fn(),
  decryptRecordAmount: jest.fn(),
}));

const config = {
  ...getMockedConfig("testnet"),
  isFeeSponsored: false,
  recordPickingStrategy: "auto" as const,
};

function unspent(commitment: string, microcredits: string): AleoUnspentRecord {
  return {
    ...getMockedRecord({ commitment, record_ciphertext: `ct-${commitment}` }),
    microcredits,
    decryptedData: getMockedDecryptedRecord({ nonce: commitment }),
  };
}

it("selects the same amount and fee records as the bridge for one pool", async () => {
  const pool = [unspent("a", "800000"), unspent("b", "600000"), unspent("f", "5000")];
  jest.mocked(aleoConfig.getCoinConfig).mockReturnValue(config);
  jest.mocked(getRecordScannerStatusOrThrow).mockResolvedValue(getMockedRecordScannerStatus());
  jest
    .mocked(fetchAllOwnedRecords)
    .mockResolvedValue(pool.map(({ microcredits: _m, decryptedData: _d, ...record }) => record));
  jest.mocked(decryptRecordAmount).mockImplementation(async (_c, _v, record) => {
    const match = pool.find(r => r.commitment === record.commitment)!;
    return { amount: new BigNumber(match.microcredits), details: match.decryptedData };
  });

  const account = getMockedAccount({
    aleoResources: { ...getMockedAccount().aleoResources!, unspentPrivateRecords: pool },
  });
  const transaction = getMockedTransaction({
    mode: TRANSACTION_TYPE.TRANSFER_PRIVATE,
    amount: new BigNumber(1_200_000),
    recipient: "aleo1recipient",
  }) as TransactionPrivate;

  const prepared = (await prepareTransaction(account, transaction)) as TransactionPrivate;
  const fee = estimateFees({
    configOrCurrencyId: config,
    transactionType: TRANSACTION_TYPE.TRANSFER_PRIVATE,
  }).value;
  const selected = await selectRecords({
    config,
    provableId: "uuid",
    viewKey: "vk",
    type: TRANSACTION_TYPE.TRANSFER_PRIVATE,
    amount: 1_200_000n,
    fee,
    isFeeSponsored: false,
  });

  expect(selected.amountRecords.map(r => r.commitment)).toEqual(
    prepared.properties.amountRecordCommitments,
  );
  expect(selected.feeRecord?.commitment).toBe(prepared.properties.feeRecordCommitment);
  expect(prepared.properties.amountRecordCommitments).toEqual(["a", "b"]);
});
