import { AccountRaw, Account } from "@ledgerhq/types-live";
import { HederaAccount, HederaAccountRaw, HederaResources, HederaResourcesRaw } from "../types";

function toHederaResourcesRaw(resources: HederaResources): HederaResourcesRaw {
  const { maxAutomaticTokenAssociations, isAutoTokenAssociationsEnabled } = resources;

  return {
    maxAutomaticTokenAssociations,
    isAutoTokenAssociationsEnabled,
  };
}

function fromHederaResourcesRaw(rawResources: HederaResourcesRaw): HederaResources {
  const { maxAutomaticTokenAssociations, isAutoTokenAssociationsEnabled } = rawResources;

  return {
    maxAutomaticTokenAssociations,
    isAutoTokenAssociationsEnabled,
  };
}

export function assignToAccountRaw(account: Account, accountRaw: AccountRaw): void {
  const hederaAccount = account as HederaAccount;
  const hederaAccountRaw = accountRaw as HederaAccountRaw;

  if (hederaAccount.hederaResources) {
    hederaAccountRaw.hederaResources = toHederaResourcesRaw(hederaAccount.hederaResources);
  }
}

export function assignFromAccountRaw(accountRaw: AccountRaw, account: Account) {
  const hederaAccount = account as HederaAccount;
  const hederaAccountRaw = accountRaw as HederaAccountRaw;

  if (hederaAccountRaw.hederaResources) {
    hederaAccount.hederaResources = fromHederaResourcesRaw(hederaAccountRaw.hederaResources);
  }
}
