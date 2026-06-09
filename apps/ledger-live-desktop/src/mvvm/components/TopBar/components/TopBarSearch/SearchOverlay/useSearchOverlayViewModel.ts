import { KeyboardEvent, useCallback, useMemo } from "react";
import { useNavigate } from "react-router";
import { useWalletFeaturesConfig } from "@features/platform-feature-flags";
import { setTrackingSource } from "~/renderer/analytics/TrackPage";
import { getMarketOrAssetDetailPath } from "LLD/utils/marketAssetNavigation";
import { useAssetSearchBar } from "./useAssetSearchBar";
import { SearchOverlayContextValue } from "./types";

export function useSearchOverlayViewModel() {
  const navigate = useNavigate();
  const { shouldDisplayAggregatedAssets } = useWalletFeaturesConfig("desktop");
  const { query, onChangeQuery, isOpen, open, close, mode, suggestions, results } =
    useAssetSearchBar();

  const navigateToAsset = useCallback(
    (currencyId: string) => {
      setTrackingSource("Global Search");
      navigate(getMarketOrAssetDetailPath(currencyId, shouldDisplayAggregatedAssets));
      close();
    },
    [navigate, shouldDisplayAggregatedAssets, close],
  );

  const onOpenChange = useCallback(
    (next: boolean) => {
      // close() resets the query, so backdrop click / Escape clear it.
      if (next) open();
      else close();
    },
    [open, close],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        close();
        e.currentTarget.blur();
      }
    },
    [close],
  );

  const contextValue = useMemo<SearchOverlayContextValue>(
    () => ({ close, navigateToAsset, suggestions, results, mode }),
    [close, navigateToAsset, suggestions, results, mode],
  );

  return { open: isOpen, onOpenChange, query, onChangeQuery, onKeyDown, mode, contextValue };
}
