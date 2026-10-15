import { promiseAllBatched } from "@ledgerhq/coin-module-framework/promises";
import { PROGRAM_ID } from "../constants";
import {
  decryptRecordAmount,
  fetchAllOwnedRecords,
  getRecordScannerStatusOrThrow,
} from "../network/utils";
import type { AleoCoinConfig, AleoPrivateRecord, AleoUnspentRecord } from "../types";
import { isTokenRecord } from "./utils";

export type AleoRecordPoolKind = { type: "native" } | { type: "token"; programId: string };

/** Unspent records the scanner has synced, split into credits.aleo and one token program. Same read path as `getBalance`. */
export async function fetchUnspentRecordPool({
  config,
  provableId,
  programId,
}: {
  config: AleoCoinConfig;
  provableId: string;
  programId?: string;
}): Promise<{ nativeRecords: AleoPrivateRecord[]; tokenRecords: AleoPrivateRecord[] }> {
  const [status, allRecords] = await Promise.all([
    getRecordScannerStatusOrThrow(config, provableId),
    fetchAllOwnedRecords({
      config,
      uuid: provableId,
      unspent: true,
      // server-side exact-match filters: non-empty arrays drop token records and batcher outputs
      programs: [],
      functions: [],
    }),
  ]);

  const maxBlockHeight = status.synced_up_to;
  const syncedRecords =
    typeof maxBlockHeight === "number"
      ? allRecords.filter(record => record.block_height <= maxBlockHeight)
      : allRecords;

  return {
    nativeRecords: syncedRecords.filter(record => record.program_name === PROGRAM_ID.CREDITS),
    tokenRecords:
      programId === undefined
        ? []
        : syncedRecords.filter(
            record => isTokenRecord(record) && record.program_name === programId,
          ),
  };
}

export function decryptUnspentRecords({
  config,
  viewKey,
  records,
}: {
  config: AleoCoinConfig;
  viewKey: string;
  records: AleoPrivateRecord[];
}): Promise<AleoUnspentRecord[]> {
  return promiseAllBatched(4, records, async record => {
    const { amount, details } = await decryptRecordAmount(config, viewKey, record);
    return { ...record, microcredits: amount.toFixed(0), decryptedData: details };
  });
}
