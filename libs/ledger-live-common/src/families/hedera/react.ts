import BigNumber from "bignumber.js";
import type { CryptoCurrency } from "@domain/entity-currency-crypto";
import { useEffect, useMemo } from "react";
import { log } from "@ledgerhq/logs";
import {
  getCurrentHederaPreloadData,
  getHederaPreloadData,
} from "@ledgerhq/coin-hedera/preload-data";
import { preload } from "@ledgerhq/coin-hedera/preload";
import { getDelegationStatus, filterValidatorBySearchTerm } from "./utils";
import { useObservable } from "../../observable";
import type {
  HederaAccount,
  HederaPreloadData,
  HederaValidator,
  HederaDelegation,
  HederaEnrichedDelegation,
} from "./types";

// The generic coin framework has no currency-level preload/hydrate hook (deliberately,
// per the framework's design), so hedera fetches validators itself, tezos-`useBakers`-style,
// instead of relying on a bridge preload cycle. `preload()` already publishes through
// `setHederaPreloadData`; this effect only needs to trigger the fetch.
export function useHederaPreloadData(
  currency: CryptoCurrency,
): HederaPreloadData | undefined | null {
  useEffect(() => {
    let cancelled = false;
    preload(currency).catch(error => {
      if (cancelled) return;
      log("hedera/react", "useHederaPreloadData: preload failed", { error });
    });
    return () => {
      cancelled = true;
    };
  }, [currency]);

  return useObservable(getHederaPreloadData(currency), getCurrentHederaPreloadData(currency));
}

export function useHederaValidators(currency: CryptoCurrency, search?: string): HederaValidator[] {
  const data = useHederaPreloadData(currency);

  return useMemo(() => {
    const validators = data?.validators ?? [];

    if (validators.length === 0 || !search || search === "") {
      return validators;
    }

    return validators.filter(validator => {
      return filterValidatorBySearchTerm(validator, search);
    });
  }, [data, search]);
}

export function useHederaEnrichedDelegation(
  account: HederaAccount,
  delegation: HederaDelegation,
): HederaEnrichedDelegation {
  const validators = useHederaValidators(account.currency);
  const validatorByNodeId = new Map(validators.map(v => [v.nodeId, v]));
  const validator = validatorByNodeId.get(delegation.nodeId) ?? null;

  return {
    ...delegation,
    status: getDelegationStatus(validator),
    validator: {
      name: validator?.name ?? "",
      address: validator?.address ?? "",
      addressChecksum: validator?.addressChecksum ?? null,
      nodeId: delegation.nodeId,
      minStake: validator?.minStake ?? new BigNumber(0),
      maxStake: validator?.maxStake ?? new BigNumber(0),
      activeStake: validator?.activeStake ?? new BigNumber(0),
      activeStakePercentage: validator?.activeStakePercentage ?? new BigNumber(0),
      overstaked: validator?.overstaked ?? false,
    },
  };
}
