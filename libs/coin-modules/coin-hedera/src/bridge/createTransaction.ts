import BigNumber from "bignumber.js";
import { AccountBridge } from "@ledgerhq/types-live";
import { Transaction } from "../types";
import { HEDERA_TRANSACTION_MODES } from "../constants";

/**
 * Creates an empty transaction.
 *
 * @returns {Transaction}
 */
export const createTransaction: AccountBridge<Transaction>["createTransaction"] = () => ({
  mode: HEDERA_TRANSACTION_MODES.Send,
  family: "hedera",
  amount: new BigNumber(0),
  recipient: "",
  useAllAmount: false,
});
