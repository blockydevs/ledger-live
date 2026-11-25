import BigNumber from "bignumber.js";
import { useState, useMemo, useEffect } from "react";
import { getCryptoCurrencyById } from "@domain/entity-currency-crypto";
import {
  getCurrentMultiversXPreloadData,
  getMultiversXPreloadDataUpdates,
} from "@ledgerhq/coin-multiversx/preload";
import { randomizeProviders } from "@ledgerhq/coin-multiversx/helpers/randomizeProviders";
import type { MultiversXCoinConfig } from "@ledgerhq/coin-multiversx/config";
import { createNetworkApi } from "@ledgerhq/coin-multiversx/network/api";
import type { MultiversXPreloadData } from "@ledgerhq/coin-multiversx/types";
import { log } from "@ledgerhq/logs";
import { getCurrencyBridge } from "../../bridge";
import { getCurrencyConfiguration } from "../../config";
import type { MultiversXProvider } from "./types";
import { MIN_DELEGATION_AMOUNT, MULTIVERSX_CURRENCY_ID } from "./constants";

/** As long as the legacy preload keeps its providers. */
export const PROVIDERS_MAX_AGE = 30 * 60 * 1000;

type ProvidersRequest = {
  promise: Promise<MultiversXProvider[]>;
  requestedAt: number;
  providers?: MultiversXProvider[];
};

let providersRequest: ProvidersRequest | null = null;

const isFresh = (request: ProvidersRequest | null): request is ProvidersRequest =>
  request !== null && Date.now() - request.requestedAt < PROVIDERS_MAX_AGE;

/**
 * The full staking providers, which the generic bridge has no preload for (`getValidators` drops
 * fields the UI reads). One request serves every caller until it expires; a failed one is retried.
 */
export function fetchMultiversXProviders(): Promise<MultiversXProvider[]> {
  if (isFresh(providersRequest)) return providersRequest.promise;

  const config = getCurrencyConfiguration<MultiversXCoinConfig>(MULTIVERSX_CURRENCY_ID);
  const promise = createNetworkApi(config.apiEndpoint, config.delegationApiEndpoint).getProviders();
  const request: ProvidersRequest = { promise, requestedAt: Date.now() };
  request.promise = promise.then(
    providers => {
      request.providers = providers;
      return providers;
    },
    error => {
      if (providersRequest === request) providersRequest = null;
      throw error;
    },
  );
  providersRequest = request;
  return request.promise;
}

export function useMultiversXPreloadData(): MultiversXPreloadData {
  const [state, setState] = useState<MultiversXPreloadData>(() =>
    isFresh(providersRequest) && providersRequest.providers
      ? { validators: providersRequest.providers }
      : getCurrentMultiversXPreloadData(),
  );
  useEffect(() => {
    const sub = getMultiversXPreloadDataUpdates().subscribe(data => {
      setState(data);
    });
    return () => sub.unsubscribe();
  }, []);

  // The bridge in use, not the live config key, which can change under the session-cached bridge.
  useEffect(() => {
    let mounted = true;
    getCurrencyBridge(getCryptoCurrencyById(MULTIVERSX_CURRENCY_ID))
      .then(bridge => ("preload" in bridge ? undefined : fetchMultiversXProviders()))
      .then(validators => {
        if (mounted && validators) setState({ validators });
      })
      .catch(error => {
        log("multiversx/providers", "staking providers request failed", { error: String(error) });
      });
    return () => {
      mounted = false;
    };
  }, []);

  return state;
}

export function useMultiversXRandomizedValidators(): MultiversXProvider[] {
  const { validators } = useMultiversXPreloadData();
  return useMemo(() => randomizeProviders(validators), [validators]);
}

type EnhancedValidator = MultiversXProvider & { disabled: boolean };

export function useSearchValidators(validators: MultiversXProvider[], search: string) {
  return useMemo(() => {
    const needle = search.toLowerCase();

    // Filter the providers such that they'll match the possible search criteria.
    const filter = (validator: MultiversXProvider) => {
      const [foundByContract, foundByName]: Array<boolean> = [
        validator.contract.toLowerCase().includes(needle),
        validator.identity.name ? validator.identity.name.toLowerCase().includes(needle) : false,
      ];

      return foundByName || foundByContract;
    };

    // Map the providers such that they'll be assigned the "disabled" key if conditions are met.
    const disable = (validator: MultiversXProvider): EnhancedValidator => {
      const [alpha, beta] = [validator.maxDelegationCap, validator.totalActiveStake];
      const delegative = alpha !== "0" && validator.withDelegationCap;
      const difference = new BigNumber(alpha).minus(beta);

      return Object.assign(validator, {
        disabled: delegative && difference.isLessThan(MIN_DELEGATION_AMOUNT),
      });
    };

    // Sort by total active stake (highest first).
    const items = [...validators]
      .sort((a, b) =>
        new BigNumber(b.totalActiveStake).comparedTo(new BigNumber(a.totalActiveStake)),
      )
      .map(disable);

    return search ? items.filter(filter) : items;
  }, [validators, search]);
}
