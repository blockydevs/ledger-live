import BigNumber from "bignumber.js";
import type { HederaAccount, HederaDelegation } from "@ledgerhq/coin-hedera/types/index";

/**
 * Reads the single staking position Hedera keeps per account and shapes it as the
 * `HederaDelegation` the UI consumes. Returns undefined when the account holds no position.
 */
export function getHederaDelegation(account: HederaAccount): HederaDelegation | undefined {
  const stake = account.stakingPositions?.[0];
  const nodeId = stake?.details?.stakedNodeId;

  if (!stake || nodeId === undefined || nodeId < 0) {
    return undefined;
  }

  return {
    nodeId,
    delegated: new BigNumber((stake.amountDeposited ?? 0n).toString()),
    pendingReward: new BigNumber((stake.amountRewarded ?? 0n).toString()),
  };
}
