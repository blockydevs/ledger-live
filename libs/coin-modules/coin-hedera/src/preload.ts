import { log } from "@ledgerhq/logs";
import type { CryptoCurrency } from "@ledgerhq/ledger-wallet-framework/types";
import { makeLRUCache, minutes } from "@ledgerhq/live-network/cache";
import BigNumber from "bignumber.js";
import { extractCompanyFromNodeDescription, getChecksum, sortValidators } from "./logic/utils";
import { apiClient } from "./network/api";
import { setHederaPreloadData } from "./preload-data";
import type { HederaPreloadData, HederaValidator } from "./types";

// No currency-level cache-hydration hook calls into this module (the generic coin
// framework has none), so every mount of a validator-consuming hook would otherwise
// re-walk the whole paginated mirror-node listing. Cache per currency for the same
// 15-minute window the deleted AccountBridge's getPreloadStrategy specified.
const cachedPreload = makeLRUCache(
  async (currency: CryptoCurrency): Promise<HederaPreloadData> => {
    log("hedera/preload", "preloading hedera data...");
    const result = await apiClient.getNodes({
      configOrCurrencyId: currency.id,
      fetchAllPages: true,
    });

    const validators: HederaValidator[] = result.nodes.map(mirrorNode => {
      const minStake = new BigNumber(mirrorNode.min_stake);
      const maxStake = new BigNumber(mirrorNode.max_stake);
      const activeStake = new BigNumber(mirrorNode.stake_rewarded);
      const activeStakePercentage = maxStake.gt(0)
        ? activeStake.dividedBy(maxStake).multipliedBy(100).dp(0, BigNumber.ROUND_CEIL)
        : new BigNumber(0);

      return {
        nodeId: mirrorNode.node_id,
        address: mirrorNode.node_account_id,
        addressChecksum: getChecksum(mirrorNode.node_account_id),
        name: extractCompanyFromNodeDescription(mirrorNode.description),
        minStake,
        maxStake,
        activeStake,
        activeStakePercentage,
        overstaked: activeStake.gte(maxStake),
      };
    });

    const sortedValidators = sortValidators(validators);
    const data: HederaPreloadData = {
      validators: sortedValidators,
    };

    setHederaPreloadData(data, currency);

    return data;
  },
  currency => currency.id,
  minutes(15),
);

export async function preload(currency: CryptoCurrency): Promise<HederaPreloadData> {
  return cachedPreload(currency);
}
