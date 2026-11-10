import BigNumber from "bignumber.js";
import invariant from "invariant";
import { promiseAllBatched } from "@ledgerhq/coin-module-framework/promises";
import {
  MAX_PRIVATE_RECORDS_PER_TRANSACTION,
  MAX_PRIVATE_TOKEN_RECORDS_PER_TRANSACTION,
  PROGRAM_ID,
} from "../constants";
import { sdkClient } from "../network/sdk";
import { decryptRecordAmount, fetchAllOwnedRecords } from "../network/utils";
import type {
  AleoCoinConfig,
  AleoDecryptedRecordResponse,
  AleoPrivateRecord,
  AleoUnspentRecord,
} from "../types";
import { findBestRecordForFee, isTokenRecord, selectPrivateRecordsForAmount } from "./utils";

type PrivacyParams = {
  config: AleoCoinConfig;
  provableId: string;
  viewKey: string;
};

function fetchUnspentRecords(
  config: AleoCoinConfig,
  provableId: string,
): Promise<AleoPrivateRecord[]> {
  return fetchAllOwnedRecords({
    config,
    uuid: provableId,
    unspent: true,
    // empty arrays opt out of the credits.aleo-only filter, returning records for all programs
    programs: [],
    functions: [],
  });
}

function filterRecordsByProgram(
  records: AleoPrivateRecord[],
  programId: string,
): AleoPrivateRecord[] {
  const programRecords = records.filter(record => record.program_name === programId);
  if (programId === PROGRAM_ID.CREDITS) return programRecords;

  return programRecords.filter(isTokenRecord);
}

function decryptRecords(
  config: AleoCoinConfig,
  viewKey: string,
  records: AleoPrivateRecord[],
): Promise<AleoUnspentRecord[]> {
  return promiseAllBatched(4, records, async record => {
    const decryptedRecord = await decryptRecordAmount(config, viewKey, record);

    return {
      ...record,
      microcredits: decryptedRecord.amount.toString(),
      decryptedData: decryptedRecord.details,
    };
  });
}

/**
 * Picks the unspent records a private root intent spends, then the `credits.aleo` record that pays
 * its fee, as the bridge does in `prepareTransaction`. `fee: null` means sponsored: no fee record.
 */
export async function selectPrivateRecords({
  config,
  provableId,
  viewKey,
  programId,
  amount,
  fee,
}: PrivacyParams & {
  programId: string;
  amount: bigint;
  fee: bigint | null;
}): Promise<{ recordCommitments: string[]; feeRecordCommitment?: string }> {
  invariant(amount > 0n, `aleo: amount must be positive to select records, got ${amount}`);

  const isTokenTx = programId !== PROGRAM_ID.CREDITS;

  const unspentRecords = await fetchUnspentRecords(config, provableId);

  const amountRecordPool = await decryptRecords(
    config,
    viewKey,
    filterRecordsByProgram(unspentRecords, programId),
  );

  const amountRecords = selectPrivateRecordsForAmount({
    unspentRecords: amountRecordPool,
    targetAmount: new BigNumber(amount.toString()),
    maxRecords: isTokenTx
      ? MAX_PRIVATE_TOKEN_RECORDS_PER_TRANSACTION
      : MAX_PRIVATE_RECORDS_PER_TRANSACTION,
  });
  invariant(amountRecords.length > 0, `aleo: no private records cover the amount of ${amount}`);

  const recordCommitments = amountRecords.map(record => record.commitment);
  if (typeof fee !== "bigint") {
    return { recordCommitments };
  }

  const feeRecordPool = isTokenTx
    ? await decryptRecords(
        config,
        viewKey,
        filterRecordsByProgram(unspentRecords, PROGRAM_ID.CREDITS),
      )
    : amountRecordPool;

  const feeRecord = findBestRecordForFee({
    unspentRecords: feeRecordPool,
    targetFee: new BigNumber(fee.toString()),
    selectedAmountRecordCommitments: isTokenTx ? [] : recordCommitments,
  });
  invariant(feeRecord, `aleo: no private record covers the fee of ${fee}`);

  return { recordCommitments, feeRecordCommitment: feeRecord.commitment };
}

export async function resolvePrivateRecords({
  config,
  provableId,
  viewKey,
  programId,
  commitments,
}: PrivacyParams & {
  programId: string;
  commitments: string[];
}): Promise<AleoDecryptedRecordResponse[]> {
  const unspentRecords = await fetchUnspentRecords(config, provableId);

  const recordByCommitment = new Map(
    filterRecordsByProgram(unspentRecords, programId).map(record => [record.commitment, record]),
  );

  const missingCommitments = commitments.filter(commitment => !recordByCommitment.has(commitment));
  invariant(
    missingCommitments.length === 0,
    `aleo: no unspent ${programId} records for: ${missingCommitments.join(", ")}`,
  );

  const records = commitments.flatMap(commitment => recordByCommitment.get(commitment) ?? []);

  return promiseAllBatched(4, records, record => {
    return sdkClient.decryptRecord({ config, viewKey, ciphertext: record.record_ciphertext });
  });
}
