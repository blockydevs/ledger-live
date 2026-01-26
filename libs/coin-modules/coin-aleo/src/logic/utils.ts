import { createHash } from "crypto";
import BigNumber from "bignumber.js";
import invariant from "invariant";
import { decodeAccountId, encodeAccountId } from "@ledgerhq/coin-framework/account/accountId";
import { decodeOperationId, encodeOperationId } from "@ledgerhq/coin-framework/operation";
import type { CryptoCurrency } from "@ledgerhq/types-cryptoassets";
import type { Account, OperationType } from "@ledgerhq/types-live";
import type { AleoNetworkType, Transaction } from "../types";
import aleoConfig from "../config";

export function getNetworkConfig(currency: CryptoCurrency) {
  const config = aleoConfig.getCoinConfig(currency);

  return {
    nodeUrl: config.apiUrls.node,
    sdkUrl: config.apiUrls.sdk,
    networkType: config.networkType,
  };
}

export function parseMicrocredits(microcreditsU64: string): string {
  invariant(microcreditsU64.endsWith("u64"), `aleo: invalid balance format (${microcreditsU64})`);
  return microcreditsU64.slice(0, -3);
}

export function patchAccountWithViewKey(account: Account, viewKey: string): Account {
  const accountIdParams = decodeAccountId(account.id);
  const updatedAccountId = encodeAccountId({
    ...accountIdParams,
    customData: viewKey,
  });

  return {
    ...account,
    id: updatedAccountId,
    operations: account.operations.map(op => {
      const { hash, type } = decodeOperationId(op.id);
      const updatedOperationId = encodeOperationId(updatedAccountId, hash, type);

      return {
        ...op,
        id: updatedOperationId,
        accountId: updatedAccountId,
      };
    }),
  };
}

export const determineTransactionType = (
  functionId: string,
  operationType: OperationType,
): AleoNetworkType => {
  if (functionId === "transfer_private") return "private";
  if (functionId === "transfer_public") return "public";
  if (operationType === "IN") {
    if (functionId.endsWith("to_private")) {
      return "private";
    } else if (functionId.endsWith("to_public")) {
      return "public";
    }
  } else if (operationType === "OUT") {
    if (functionId.startsWith("transfer_private")) {
      return "private";
    } else if (functionId.startsWith("transfer_public")) {
      return "public";
    }
  }
  return undefined;
};

export const generateUniqueUsername = (address: string): string => {
  const timestamp = new Date().getTime().toString();
  const combined = `${timestamp}_${address}`;
  const hash = createHash("sha256").update(combined).digest("hex");
  return hash;
};

export function calculateAmount({
  account,
  transaction,
  estimatedFees,
}: {
  account: Account;
  transaction: Transaction;
  estimatedFees: BigNumber;
}) {
  let amount = transaction.amount;

  if (transaction.useAllAmount) {
    amount = BigNumber.max(0, account.balance.minus(estimatedFees));
  }

  const totalSpent = amount.plus(estimatedFees);

  return {
    amount,
    totalSpent,
  };
}

export interface SignedAleoTransaction {
  authorization: Record<string, unknown>;
  feeAuthorization: Record<string, unknown>;
}

export function serializeTransaction(tx: SignedAleoTransaction): string {
  return Buffer.from(JSON.stringify(tx)).toString("hex");
}

export function deserializeTransaction(serialized: string): SignedAleoTransaction {
  return JSON.parse(Buffer.from(serialized, "hex").toString("utf8"));
}
