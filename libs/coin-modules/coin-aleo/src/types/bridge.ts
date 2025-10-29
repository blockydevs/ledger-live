import type {
  Operation,
  TransactionCommon,
  TransactionCommonRaw,
  TransactionStatusCommon,
  TransactionStatusCommonRaw,
} from "@ledgerhq/types-live";

export type Transaction = TransactionCommon & {
  family: "aleo";
};

export type TransactionRaw = TransactionCommonRaw & {
  family: "aleo";
};

export type TransactionStatus = TransactionStatusCommon;

export type TransactionStatusRaw = TransactionStatusCommonRaw;

// FIXME: refactor to more proper types
export type AleoOperationExtra = {
  consensusTimestamp?: string;
  transactionId?: string;
  associatedTokenId?: string;
  pagingToken?: string;
  memo?: string | null;
};

export type AleoOperation = Operation<AleoOperationExtra>;
