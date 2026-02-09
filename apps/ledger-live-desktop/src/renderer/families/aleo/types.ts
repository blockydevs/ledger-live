import type {
  AleoAccount,
  AleoOperation,
  Transaction,
  TransactionStatus,
} from "@ledgerhq/live-common/families/aleo/types";
import type { LLDCoinFamily } from "../types";
import type { Account } from "@ledgerhq/types-live";

export type AleoFamily = LLDCoinFamily<AleoAccount, Transaction, TransactionStatus, AleoOperation>;
