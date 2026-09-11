import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import type { CryptoCurrency } from "@domain/entity-currency-crypto";
import { lastBlock } from "@ledgerhq/live-common/families/aleo/logic";
import { getCurrencyConfiguration } from "@ledgerhq/live-common/config/index";
import type { AleoCoinConfig } from "@ledgerhq/live-common/families/aleo/types";
import useInterval from "~/components/useInterval";
import { LIVE_BLOCK_HEIGHT_POLL_MS } from "../constants";

type Options = {
  fallbackHeight: number;
  enabled: boolean;
};

/** Polling pauses while the app is backgrounded, and network errors keep the last good value. */
export function useAleoLiveBlockHeight(
  currency: CryptoCurrency,
  { fallbackHeight, enabled }: Options,
): number {
  const [liveHeight, setLiveHeight] = useState<number | null>(null);
  // Skip overlapping fetches, and ignore a fetch that resolves after the current
  // enabled-session ended (so a late reply can't overwrite the reset).
  const inFlight = useRef(false);
  const cancelled = useRef(false);

  const fetchHeight = useCallback(async () => {
    if (!enabled || inFlight.current || AppState.currentState === "background") return;
    // getCurrencyConfiguration throws when no config is registered for the currency.
    let config: AleoCoinConfig;
    try {
      config = getCurrencyConfiguration<AleoCoinConfig>(currency.id);
    } catch {
      return;
    }
    inFlight.current = true;
    try {
      const block = await lastBlock(config);
      if (!cancelled.current) setLiveHeight(block.height);
    } catch {
      // Keep the last good value; the next tick will retry.
    } finally {
      inFlight.current = false;
    }
    // currency.id keeps the callback stable across referentially-new currency objects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency.id, enabled]);

  // useInterval's delay is typed as a plain number, so the enabled gate lives in
  // fetchHeight itself rather than in the delay argument.
  useInterval(fetchHeight, LIVE_BLOCK_HEIGHT_POLL_MS);

  useEffect(() => {
    if (!enabled) {
      // Drop any stale height from a previous countdown so the next one starts clean instead
      // of inheriting an inflated value.
      setLiveHeight(null);
      return;
    }
    cancelled.current = false;
    fetchHeight();
    const subscription = AppState.addEventListener("change", state => {
      if (state === "active") fetchHeight();
    });

    return () => {
      cancelled.current = true;
      subscription.remove();
    };
  }, [enabled, fetchHeight]);

  return liveHeight != null ? Math.max(liveHeight, fallbackHeight) : fallbackHeight;
}
