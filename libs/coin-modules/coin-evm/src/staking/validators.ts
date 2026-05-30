import network from "@ledgerhq/live-network";
import { makeLRUCache } from "@ledgerhq/live-network/cache";
import type { Cursor, Page, Validator } from "@ledgerhq/coin-module-framework/api/index";
import type { StakingValidatorItem } from "@ledgerhq/types-live";
import { STAKING_CONTRACTS } from "./contracts";

export type ValidatorApi = {
  fetchValidators: (
    currencyId: string,
    cursor?: Cursor,
  ) => Promise<Page<StakingValidatorItem>>;
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

// Sei's REST endpoint returns the whole validator set in one response, so it
// ignores the cursor and always reports `next: undefined` (single page).
const seiValidatorApi: ValidatorApi = {
  fetchValidators: async (currencyId): Promise<Page<StakingValidatorItem>> => {
    const apiConfig = STAKING_CONTRACTS[currencyId]?.apiConfig;
    if (!apiConfig?.baseUrl) return { items: [], next: undefined };

    const { baseUrl, validatorsEndpoint } = apiConfig;

    try {
      const { data } = await network<CosmosValidatorsResponse>({
        url: `${baseUrl}${validatorsEndpoint}`,
        method: "GET",
      });

      const items: StakingValidatorItem[] = Array.isArray(data?.validators)
        ? data.validators
            .filter((v): v is CosmosValidator => typeof v?.operator_address === "string")
            .map((v, index) => ({
              validatorAddress: v.operator_address,
              name: v.description?.moniker ?? v.operator_address,
              commission: Number.parseFloat(v.commission?.commission_rates?.rate ?? "0"),
              tokens: v.tokens ?? "0",
              votingPower: index,
              estimatedYearlyRewardsRate: 0,
            }))
        : [];

      return { items, next: undefined };
    } catch (error) {
      console.error("Failed to fetch SEI validators", {
        error: error instanceof Error ? error.message : String(error),
        baseUrl,
      });
      return { items: [], next: undefined };
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
  cursor?: Cursor,
): Promise<Page<StakingValidatorItem>> => {
  const api = getValidatorApi(currencyId);
  if (!api) return { items: [], next: undefined };
  return api.fetchValidators(currencyId, cursor);
};

// One cache key per page, so each page of a paginated chain (e.g. Monad) is
// cached and deduplicated independently. Because makeLRUCache stores the pending
// promise, concurrent callers (e.g. Info modal + Delegate modal opening in quick
// succession) share one in-flight fetch — no separate request-deduplication map needed.
const pageKey = (currencyId: string, cursor?: Cursor): string => `${currencyId}-${cursor ?? ""}`;

const validatorsCache = makeLRUCache(
  (currencyId: string, cursor?: Cursor) => resolveValidators(currencyId, cursor),
  (currencyId: string, cursor?: Cursor) => pageKey(currencyId, cursor),
  { max: 50, ttl: CACHE_MAX_AGE_MS },
);

// makeLRUCache exposes no key enumeration, so we track the page keys we've issued
// to support clearing every page of a single currency (keys are `currencyId-cursor`).
const issuedKeys = new Set<string>();

export const clearValidatorsCache = (currencyId?: string): void => {
  if (!currencyId) {
    validatorsCache.reset();
    issuedKeys.clear();
    return;
  }

  // Evict every cached page of this currency (the `-` delimiter keeps e.g.
  // "monad" from matching "monad2").
  for (const key of issuedKeys) {
    if (key.startsWith(`${currencyId}-`)) {
      validatorsCache.clear(key);
      issuedKeys.delete(key);
    }
  }
};

export const getValidators = async (
  currencyId: string,
  cursor?: Cursor,
): Promise<Page<StakingValidatorItem>> => {
  const key = pageKey(currencyId, cursor);
  issuedKeys.add(key);

  try {
    const page = await validatorsCache(currencyId, cursor);
    // Never keep an empty page cached, so a transient empty response is retried next time.
    if (page.items.length === 0) {
      validatorsCache.clear(key);
      issuedKeys.delete(key);
    }
    return page;
  } catch (error) {
    // makeLRUCache already evicted the rejected entry; keep issuedKeys in sync.
    issuedKeys.delete(key);
    throw error;
  }
};

/**
 * Fire-and-forget warm-up of the validators cache. Called before the user
 * reaches the validator selection step so the list appears instantly. A fresh
 * cache entry already returns without a network call, so repeated calls are cheap.
 * Only the first page is warmed; subsequent pages are fetched lazily by the hook.
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

export const getValidatorsPage = async (
  currencyId: string,
  cursor?: Cursor,
): Promise<Page<Validator>> => {
  const page = await getValidators(currencyId, cursor);
  return {
    items: page.items.map(v => ({
      address: v.validatorAddress,
      name: v.name,
      balance: toValidatorBalance(v.tokens),
      commissionRate: v.commission.toString(),
      apy: v.estimatedYearlyRewardsRate,
    })),
    next: page.next,
  };
};
