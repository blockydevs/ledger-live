import type BigNumber from "bignumber.js";
import invariant from "invariant";
import type { AleoCoinConfig, AleoDecryptedRecordResponse, AleoUnspentRecord } from "../types";
import {
  type AleoRecordPoolKind,
  decryptUnspentRecords,
  fetchUnspentRecordPool,
} from "./fetchUnspentRecordPool";
import {
  assertAmountRecordCommitmentCount,
  resolveDecryptedAmountRecordsFromCommitments,
  sumPrivateRecords,
} from "./utils";

/** Resolves commitments from a selection call against the current pool. Never picks again. */
export async function resolveRecords({
  config,
  provableId,
  viewKey,
  commitments,
  pool,
  maxRecords,
}: {
  config: AleoCoinConfig;
  provableId: string;
  viewKey: string;
  commitments: string[];
  pool: AleoRecordPoolKind;
  maxRecords: number;
}): Promise<{ records: AleoDecryptedRecordResponse[]; total: BigNumber }> {
  assertAmountRecordCommitmentCount({ type: pool.type, commitments, maxRecords });
  const duplicates = commitments.filter((c, index) => commitments.indexOf(c) !== index);
  invariant(
    duplicates.length === 0,
    `aleo: duplicate record commitments: ${duplicates.join(", ")}`,
  );

  const { nativeRecords, tokenRecords } = await fetchUnspentRecordPool({
    config,
    provableId,
    ...(pool.type === "token" && { programId: pool.programId }),
  });
  const wanted = new Set(commitments);
  const matches = await decryptUnspentRecords({
    config,
    viewKey,
    records: (pool.type === "token" ? tokenRecords : nativeRecords).filter(record =>
      wanted.has(record.commitment),
    ),
  });
  const byCommitment = new Map<string, AleoUnspentRecord>(
    matches.map(record => [record.commitment, record]),
  );

  const records = resolveDecryptedAmountRecordsFromCommitments({
    type: pool.type,
    commitments,
    maxRecords,
    findRecord: commitment => byCommitment.get(commitment) ?? null,
  });

  return { records, total: sumPrivateRecords(matches) };
}
