import BigNumber from "bignumber.js";
import { apiClient } from "../network/api";
import { AleoDecryptedRecordResponse, AleoPrivateTransaction } from "../types/api";
import { sdkClient } from "../network/sdk";
import { parseMicrocredits } from "./utils";

export async function getPrivateBalance({
  jwtToken,
  uuid,
  apiKey,
  viewKey,
}: {
  jwtToken: string;
  uuid: string;
  apiKey: string;
  viewKey: string;
}): Promise<{ records: AleoPrivateTransaction[]; balance: BigNumber }> {
  const records: AleoPrivateTransaction[] = await apiClient.getAccountOwnedRecords({
    jwtToken,
    apiKey,
    uuid,
    unspent: true,
  });
  let balance: BigNumber = new BigNumber(0);

  for (const record of records) {
    const decryptedRecord = await sdkClient.decryptRecord<AleoDecryptedRecordResponse>(
      record.record_ciphertext,
      viewKey,
    );
    const microcreditsU64 = decryptedRecord.data.microcredits.split(".")[0];
    const microcredits = parseMicrocredits(microcreditsU64);

    balance = balance.plus(microcredits);
  }

  return { records, balance };
}
