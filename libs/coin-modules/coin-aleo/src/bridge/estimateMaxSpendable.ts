// import { getMainAccount } from "@ledgerhq/coin-framework/account/index";
import type { AccountBridge } from "@ledgerhq/types-live";
import { Transaction as EvmTransaction } from "../types";
import BigNumber from "bignumber.js";

export const estimateMaxSpendable: AccountBridge<EvmTransaction>["estimateMaxSpendable"] = async ({
  account,
  parentAccount,
  transaction,
}) => {
  // eslint-disable-next-line no-console
  console.log(account, parentAccount, transaction);
  return BigNumber(0);
};
