import type { Account, AccountRaw } from "@ledgerhq/types-live";
import BigNumber from "bignumber.js";
import type {
  HederaAccount,
  HederaAccountRaw,
  HederaResources,
  HederaResourcesRaw,
  HederaStakeRaw,
  StakeWithNodeDetails,
} from "@ledgerhq/coin-hedera/types";

function toStakeRaw(stake: StakeWithNodeDetails): HederaStakeRaw {
  return {
    ...stake,
    amount: stake.amount.toString(),
    amountDeposited: stake.amountDeposited?.toString(),
    amountRewarded: stake.amountRewarded?.toString(),
  };
}

function fromStakeRaw(raw: HederaStakeRaw): StakeWithNodeDetails {
  return {
    ...raw,
    amount: BigInt(raw.amount),
    amountDeposited: raw.amountDeposited !== undefined ? BigInt(raw.amountDeposited) : undefined,
    amountRewarded: raw.amountRewarded !== undefined ? BigInt(raw.amountRewarded) : undefined,
  };
}

function toHederaResourcesRaw(resources: HederaResources): HederaResourcesRaw {
  const { maxAutomaticTokenAssociations, isAutoTokenAssociationEnabled, delegation } = resources;
  return {
    maxAutomaticTokenAssociations,
    isAutoTokenAssociationEnabled,
    delegation: delegation
      ? {
          nodeId: delegation.nodeId,
          delegated: delegation.delegated.toString(),
          pendingReward: delegation.pendingReward.toString(),
        }
      : null,
  };
}

function fromHederaResourcesRaw(raw: HederaResourcesRaw): HederaResources {
  const { maxAutomaticTokenAssociations, isAutoTokenAssociationEnabled, delegation } = raw;
  return {
    maxAutomaticTokenAssociations,
    isAutoTokenAssociationEnabled,
    delegation: delegation
      ? {
          nodeId: delegation.nodeId,
          delegated: new BigNumber(delegation.delegated),
          pendingReward: new BigNumber(delegation.pendingReward),
        }
      : null,
  };
}

export function assignToAccountRaw(account: Account, accountRaw: AccountRaw): void {
  const positions = (account as HederaAccount).stakingPositions;
  if (positions?.length) {
    (accountRaw as HederaAccountRaw).stakingPositions = positions.map(toStakeRaw);
  }

  const resources = (account as HederaAccount).hederaResources;
  if (resources) {
    (accountRaw as HederaAccountRaw).hederaResources = toHederaResourcesRaw(resources);
  }
}

export function assignFromAccountRaw(accountRaw: AccountRaw, account: Account): void {
  const raw = (accountRaw as HederaAccountRaw).stakingPositions;
  (account as HederaAccount).stakingPositions = raw ? raw.map(fromStakeRaw) : [];

  const rawResources = (accountRaw as HederaAccountRaw).hederaResources;
  if (rawResources) {
    (account as HederaAccount).hederaResources = fromHederaResourcesRaw(rawResources);
  }
}
