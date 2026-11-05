import BigNumber from "bignumber.js";
import invariant from "invariant";
import { NotEnoughBalance } from "@ledgerhq/ledger-wallet-framework/errors";
import {
  MAX_PRIVATE_RECORDS_PER_TRANSACTION,
  MAX_PRIVATE_TOKEN_RECORDS_PER_TRANSACTION,
} from "../constants";
import { AleoAmountTooLargeForTransaction, AleoFeeRecordRequired } from "../errors";
import type { AleoCoinConfig, AleoUnspentRecord, TransactionType } from "../types";
import { decryptUnspentRecords, fetchUnspentRecordPool } from "./fetchUnspentRecordPool";
import {
  findBestRecordForFee,
  isTokenTransaction,
  selectPrivateRecordsForAmount,
  sumPrivateRecords,
} from "./utils";

/** Picks amount and fee records the way `bridge/prepareTransaction.ts` does, from the live scanner pool. */
export async function selectRecords({
  config,
  provableId,
  viewKey,
  type,
  amount,
  programId,
  fee,
  isFeeSponsored,
}: {
  config: AleoCoinConfig;
  provableId: string;
  viewKey: string;
  type: TransactionType;
  amount: bigint;
  programId?: string;
  fee: bigint;
  isFeeSponsored: boolean;
}): Promise<{ amountRecords: AleoUnspentRecord[]; feeRecord: AleoUnspentRecord | null }> {
  invariant(amount > 0n, "aleo: amount must be positive");
  const isToken = isTokenTransaction({ mode: type });
  invariant(!isToken || programId, `aleo: programId is required for ${type}`);

  const pool = await fetchUnspentRecordPool({
    config,
    provableId,
    ...(isToken && programId !== undefined && { programId }),
  });
  const decrypt = (records: typeof pool.nativeRecords) =>
    decryptUnspentRecords({ config, viewKey, records });

  const actionPool = await decrypt(isToken ? pool.tokenRecords : pool.nativeRecords);

  const targetAmount = new BigNumber(amount.toString());
  const amountRecords = selectPrivateRecordsForAmount({
    unspentRecords: actionPool,
    targetAmount,
    maxRecords: isToken
      ? MAX_PRIVATE_TOKEN_RECORDS_PER_TRANSACTION
      : MAX_PRIVATE_RECORDS_PER_TRANSACTION,
  });

  if (amountRecords.length === 0) {
    const poolTotal = sumPrivateRecords(actionPool);
    if (poolTotal.isZero() || poolTotal.lt(targetAmount)) throw new NotEnoughBalance();
    throw new AleoAmountTooLargeForTransaction();
  }

  if (isFeeSponsored) return { amountRecords, feeRecord: null };

  const nativePool = isToken ? await decrypt(pool.nativeRecords) : actionPool;
  const feeRecord = findBestRecordForFee({
    unspentRecords: nativePool,
    targetFee: new BigNumber(fee.toString()),
    selectedAmountRecordCommitments: isToken ? [] : amountRecords.map(record => record.commitment),
  });
  if (!feeRecord) throw new AleoFeeRecordRequired();

  return { amountRecords, feeRecord };
}
