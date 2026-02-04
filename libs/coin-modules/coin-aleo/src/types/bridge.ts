import type BigNumber from "bignumber.js";
import type {
  Account,
  AccountRaw,
  Operation,
  TransactionCommon,
  TransactionCommonRaw,
  TransactionStatusCommon,
  TransactionStatusCommonRaw,
} from "@ledgerhq/types-live";
import { TRANSACTION_TYPE } from "../constants";
import { AleoJWT, AleoRecordScannerStatusResponse } from "./api";

export type Transaction = TransactionCommon & {
  family: "aleo";
  fees: BigNumber;
  type: TRANSACTION_TYPE;
};

export type TransactionRaw = TransactionCommonRaw & {
  family: "aleo";
  fees: string;
};

export type TransactionStatus = TransactionStatusCommon;

export type TransactionStatusRaw = TransactionStatusCommonRaw;

export interface ProvableApi {
  apiKey: string | undefined;
  consumerId: string | undefined;
  jwt: AleoJWT | undefined;
  uuid: string | undefined;
  scannerStatus?: AleoRecordScannerStatusResponse;
}

export interface AleoResources {
  transparentBalance: BigNumber;
  privateBalance: BigNumber | null;
  lastPrivateSyncDate: Date | null;
  provableApi: ProvableApi | null;
}

export interface AleoResourcesRaw {
  transparentBalance: string;
  privateBalance: string | null;
  lastPrivateSyncDate: string | null;
  provableApi: string | null;
}

export type AleoAccount = Account & {
  aleoResources: AleoResources;
};

export type AleoAccountRaw = AccountRaw & {
  aleoResources: AleoResourcesRaw;
};

export type AleoNetworkType = "public" | "private" | undefined;

export type AleoOperationExtra = {
  functionId?: string;
  transactionType?: AleoNetworkType;
};

export type AleoOperation = Operation<AleoOperationExtra>;
