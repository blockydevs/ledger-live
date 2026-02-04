export const PROGRAM_ID = {
  CREDITS: "credits.aleo",
} as const;

export enum TRANSACTION_TYPE {
  TRANSFER_PUBLIC = "transfer_public",
  TRANSFER_PRIVATE = "transfer_private",
  CONVERT_PUBLIC_TO_PRIVATE = "convert_public_to_private",
  CONVERT_PRIVATE_TO_PUBLIC = "convert_private_to_public",
  SPLIT = "split",
}

export const feesByTransactionType = {
  [TRANSACTION_TYPE.TRANSFER_PUBLIC]: 34060,
  [TRANSACTION_TYPE.CONVERT_PUBLIC_TO_PRIVATE]: 17972,
  [TRANSACTION_TYPE.TRANSFER_PRIVATE]: 2308,
  [TRANSACTION_TYPE.CONVERT_PRIVATE_TO_PUBLIC]: 18494,
  [TRANSACTION_TYPE.SPLIT]: 0,
} as const;

export const ESTIMATED_FEE_SAFETY_RATE = 1.1 as const;
