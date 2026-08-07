import type {
  HederaAccount,
  Transaction,
  TransactionStatus,
  HederaOperation,
} from "@ledgerhq/live-common/families/hedera/types";
import type { Account } from "@ledgerhq/types-live";
import type { LLDCoinFamily } from "../types";

export type HederaFamily = LLDCoinFamily<
  HederaAccount,
  Transaction,
  TransactionStatus,
  HederaOperation
>;

export type SendAmountProps = {
  account: Account;
  transaction: Transaction;
  status: TransactionStatus;
  onChange: (a: Transaction) => void;
  trackProperties?: object;
  autoFocus?: boolean;
};
