import invariant from "invariant";
import type {
  CraftedTransaction,
  MemoNotSupported,
  TransactionIntent,
} from "@ledgerhq/coin-module-framework/api/types";
import { sdkClient } from "../network/sdk";
import type { AleoCoinConfig, AleoTransactionIntentData, FeeConfiguration } from "../types";
import { mapTransactionIntentToSdkIntent, toHex } from "./utils";

export async function craftTransaction({
  config,
  txIntent,
  feeConfiguration,
  viewKey,
}: {
  config: AleoCoinConfig;
  txIntent: TransactionIntent<MemoNotSupported, AleoTransactionIntentData>;
  feeConfiguration: FeeConfiguration | null;
  viewKey?: string;
}): Promise<CraftedTransaction> {
  const recordsData = "data" in txIntent && "records" in txIntent.data ? txIntent.data : null;
  const tvks = recordsData?.tvks;
  const intent = mapTransactionIntentToSdkIntent(txIntent);

  if (recordsData) {
    const recordsCount = recordsData.records.length;
    const isTxWithNestedCalls = recordsCount > 1;
    // one root tvk plus one per nested transition, see bridge/signOperation getTvks
    const expectedTvksCount = isTxWithNestedCalls ? recordsCount + 1 : 0;
    invariant(
      recordsData.tvks.length === expectedTvksCount,
      `aleo: expected ${expectedTvksCount} tvks for ${recordsCount} records, got ${recordsData.tvks.length}`,
    );
  }

  const response = await sdkClient.createRequestFromIntent({
    config,
    intent,
    feeConfiguration,
    ...(viewKey !== undefined && { viewKey }),
    ...(tvks && tvks.length > 0 && { tvks }),
  });

  const transaction = toHex(response);

  return { transaction };
}
