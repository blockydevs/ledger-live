import type { Account } from "@ledgerhq/types-live";
import perFamilyManageAssets from "../../generated/accountManageAssets";

/** The screen a family gives to manage the assets of an account, e.g. the tokens of an XRP account */
export function getManageAssetsScreen(account: Account) {
  const { family } = account.currency;
  if (!(family in perFamilyManageAssets)) return undefined;

  return perFamilyManageAssets[family as keyof typeof perFamilyManageAssets](account);
}
