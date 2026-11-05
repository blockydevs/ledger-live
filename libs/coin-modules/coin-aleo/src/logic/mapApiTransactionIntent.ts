import invariant from "invariant";
import { PRIVATE_ROOT_INTENT_TYPES } from "../constants";
import type {
  AleoApiPrivateRootIntentData,
  AleoApiTransactionIntent,
  AleoApiTransactionIntentData,
  AleoDecryptedRecordResponse,
  AleoTransactionIntent,
} from "../types";

type AleoApiPublicIntentData = Exclude<
  AleoApiTransactionIntentData,
  AleoApiPrivateRootIntentData | { type: "fee_private" }
>;

function isPrivateRootApiData(
  data: AleoApiTransactionIntentData,
): data is AleoApiPrivateRootIntentData {
  return PRIVATE_ROOT_INTENT_TYPES.has(data.type);
}

function isPublicApiData(data: AleoApiTransactionIntentData): data is AleoApiPublicIntentData {
  return !isPrivateRootApiData(data) && data.type !== "fee_private";
}

function splitData(intent: AleoApiTransactionIntent) {
  if (!("data" in intent)) return { base: intent, data: undefined };
  const { data, ...base } = intent;
  return { base, data };
}

export function getPrivateRootApiData(
  intent: AleoApiTransactionIntent,
): AleoApiPrivateRootIntentData | null {
  if (!PRIVATE_ROOT_INTENT_TYPES.has(intent.type)) return null;

  const { data } = splitData(intent);
  invariant(
    data?.type === intent.type && isPrivateRootApiData(data),
    `aleo: intent data is required for ${intent.type}`,
  );

  return data;
}

export function mapPrivateRootApiIntent(
  intent: AleoApiTransactionIntent,
  records: AleoDecryptedRecordResponse[],
): AleoTransactionIntent {
  const data = getPrivateRootApiData(intent);
  invariant(data, `aleo: ${intent.type} is not a private root intent`);

  const { base } = splitData(intent);
  const tvks = data.tvks ?? [];

  if ("programId" in data) {
    return { ...base, data: { type: data.type, programId: data.programId, records, tvks } };
  }
  return { ...base, data: { type: data.type, records, tvks } };
}

export function mapPrivateFeeApiIntent(
  intent: AleoApiTransactionIntent,
  record: AleoDecryptedRecordResponse,
): AleoTransactionIntent {
  const { base, data } = splitData(intent);
  invariant(
    intent.type === "fee_private" && data?.type === "fee_private",
    "aleo: intent data is required for fee_private",
  );

  return {
    ...base,
    data: {
      type: "fee_private",
      executionId: data.executionId,
      ...(data.priorityFee !== undefined && { priorityFee: data.priorityFee }),
      record,
    },
  };
}

export function mapPublicApiIntent(intent: AleoApiTransactionIntent): AleoTransactionIntent {
  const { base, data } = splitData(intent);
  invariant(
    !PRIVATE_ROOT_INTENT_TYPES.has(intent.type) &&
      intent.type !== "fee_private" &&
      (data === undefined || isPublicApiData(data)),
    `aleo: ${intent.type} needs records and cannot map without them`,
  );

  return data === undefined ? base : { ...base, data };
}
