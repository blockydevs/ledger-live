import type { AccountLike, Account } from "@ledgerhq/types-live";
import type { CommonDeviceTransactionField as DeviceTransactionField } from "@ledgerhq/coin-framework/transaction/common";
import type { Transaction, TransactionStatus } from "../types";

function getDeviceTransactionConfig(_: {
  account: AccountLike;
  parentAccount?: Account;
  transaction: Transaction;
  status: TransactionStatus;
}): Array<DeviceTransactionField> {
  const fields: Array<DeviceTransactionField> = [];

  // TODO:

  return fields;
}

export default getDeviceTransactionConfig;
