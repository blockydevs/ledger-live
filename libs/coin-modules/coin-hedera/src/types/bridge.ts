import { TokenCurrency } from "@ledgerhq/types-cryptoassets";
import type {
  TransactionCommon,
  TransactionCommonRaw,
  TransactionStatusCommon,
  TransactionStatusCommonRaw,
} from "@ledgerhq/types-live";

export type NetworkInfo = {
  family: "hedera";
};

export type NetworkInfoRaw = {
  family: "hedera";
};

export type TokenAssociateProperties = {
  name: "tokenAssociate";
  token: TokenCurrency;
};

export type Transaction = TransactionCommon & {
  family: "hedera";
  memo?: string | undefined;
  properties?: TokenAssociateProperties;
};

export type TransactionRaw = TransactionCommonRaw & {
  family: "hedera";
  memo?: string | undefined;
  properties?: TokenAssociateProperties;
};

export type TransactionStatus = TransactionStatusCommon & {
  warningAlerts: Record<string, Error>;
};

export type TransactionStatusRaw = TransactionStatusCommonRaw;

export type HederaOperationExtra = {
  consensusTimestamp?: string;
  transactionId?: string;
};

export type HederaOperationExtraRaw = {
  consensusTimestamp?: string;
};

export type HederaOperationType = "CryptoTransfer" | "TokenTransfer" | "TokenAssociate";
