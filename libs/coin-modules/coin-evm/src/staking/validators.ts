import network from "@ledgerhq/live-network";
import { makeLRUCache } from "@ledgerhq/live-network/cache";
import type { Page, Validator } from "@ledgerhq/coin-module-framework/api/index";
import type { StakingValidatorItem } from "@ledgerhq/types-live";
import { STAKING_CONTRACTS } from "./contracts";

export type ValidatorApi = {
  fetchValidators: (config: {
    baseUrl: string;
    validatorsEndpoint: string;
  }) => Promise<StakingValidatorItem[]>;
};

type CosmosValidatorDescription = {
  moniker: string;
};

type CosmosValidatorCommission = {
  commission_rates: {
    rate: string;
  };
};

type CosmosValidator = {
  operator_address: string;
  description: CosmosValidatorDescription;
  commission: CosmosValidatorCommission;
  tokens: string;
};

/**
 * Validators cache TTL (30s, same as Cosmos preload) so a user navigating across
 * delegation screens reads a hot cache instead of paying a network roundtrip each time.
 */
const CACHE_MAX_AGE_MS = 30 * 1000;

type CosmosValidatorsResponse = { validators: CosmosValidator[] };

const seiValidatorApi: ValidatorApi = {
  fetchValidators: async config => {
    const { baseUrl, validatorsEndpoint } = config;
    if (!baseUrl) return [];

    try {
      const { data } = await network<CosmosValidatorsResponse>({
        url: `${baseUrl}${validatorsEndpoint}`,
        method: "GET",
      });

      return Array.isArray(data?.validators)
        ? data.validators
            .filter((v): v is CosmosValidator => typeof v?.operator_address === "string")
            .map(
              (v, index): StakingValidatorItem => ({
                validatorAddress: v.operator_address,
                name: v.description?.moniker ?? v.operator_address,
                commission: Number.parseFloat(v.commission?.commission_rates?.rate ?? "0"),
                tokens: v.tokens ?? "0",
                votingPower: index,
                estimatedYearlyRewardsRate: 0,
              }),
            )
        : [];
    } catch (error) {
      console.error("Failed to fetch SEI validators", {
        error: error instanceof Error ? error.message : String(error),
        baseUrl,
      });
      return [];
    }
  },
};

export const getValidatorApi = (currencyId: string): ValidatorApi | undefined => {
  switch (currencyId) {
    case "sei_evm":
      return seiValidatorApi;
    default:
      return undefined;
  }
};

const resolveValidators = async (
  currencyId: string,
  apiConfig?: { baseUrl: string; validatorsEndpoint: string },
): Promise<StakingValidatorItem[]> => {
  const api = getValidatorApi(currencyId);
  const config = apiConfig ?? STAKING_CONTRACTS[currencyId]?.apiConfig;
  if (!api || !config) return [];
  return api.fetchValidators(config);
};

// Single LRU cache keyed by currencyId. Because makeLRUCache stores the pending
// promise, concurrent callers (e.g. Info modal + Delegate modal opening in quick
// succession) share one in-flight fetch — no separate request-deduplication map needed.
const validatorsCache = makeLRUCache(
  (currencyId: string) => resolveValidators(currencyId),
  (currencyId: string) => currencyId,
  { max: 50, ttl: CACHE_MAX_AGE_MS },
);

export const clearValidatorsCache = (currencyId?: string): void => {
  if (currencyId) {
    validatorsCache.clear(currencyId);
  } else {
    validatorsCache.reset();
  }
};

export const getValidators = async (
  currencyId: string,
  apiConfig?: { baseUrl: string; validatorsEndpoint: string },
): Promise<StakingValidatorItem[]> => {
  // Explicit apiConfig bypasses the cache (callers opt out on purpose, e.g. tests).
  if (apiConfig) return resolveValidators(currencyId, apiConfig);

  const data = await validatorsCache(currencyId);
  // Never keep an empty list cached, so a transient empty response is retried next time.
  if (data.length === 0) validatorsCache.clear(currencyId);
  return data;
};

/**
 * Fire-and-forget warm-up of the validators cache. Called before the user
 * reaches the validator selection step so the list appears instantly. A fresh
 * cache entry already returns without a network call, so repeated calls are cheap.
 */
export const prefetchValidators = (currencyId: string): void => {
  void getValidators(currencyId).catch(() => {
    /* swallow: the hook surfaces errors via its own flow */
  });
};

export const getValidatorExplorerUrl = (currencyId: string, address: string): string | undefined =>
  STAKING_CONTRACTS[currencyId]?.explorerConfig?.validatorUrl?.replace("$address", address);

export const getUnbondingPeriodDays = (currencyId: string): number | undefined =>
  STAKING_CONTRACTS[currencyId]?.unbondingPeriodDays;

export const getMaxRedelegations = (currencyId: string): number | undefined =>
  STAKING_CONTRACTS[currencyId]?.maxRedelegations;

export const hasUnbondingPeriod = (currencyId: string): boolean => {
  const days = getUnbondingPeriodDays(currencyId);
  return typeof days === "number" && days > 0;
};

const toValidatorBalance = (tokens: string): bigint => {
  try {
    const balance = BigInt(tokens);
    return balance > 0n ? balance : 0n;
  } catch {
    return 0n;
  }
};

export const getValidatorsPage = async (currencyId: string): Promise<Page<Validator>> => {
  const items = await getValidators(currencyId);
  return {
    items: items.map(v => ({
      address: v.validatorAddress,
      name: v.name,
      balance: toValidatorBalance(v.tokens),
      commissionRate: v.commission.toString(),
      apy: v.estimatedYearlyRewardsRate,
    })),
    next: undefined,
  };
};
