import React, { useCallback, useEffect, useMemo } from "react";
import { useDispatch, useSelector } from "LLD/hooks/redux";
import { FeatureFlagsProvider } from "@ledgerhq/live-common/featureFlags/index";
import { Feature, FeatureId } from "@ledgerhq/types-live";
import {
  FeatureIdSchema,
  selectFeature,
  setOverride,
  setAllOverrides,
  type WithFeatureFlags,
} from "@shared/feature-flags";
import { useWalletFeaturesConfig } from "@features/platform-feature-flags";
import { setSelectedTimeRange } from "../actions/settings";

/**
 * Bridges the Redux feature-flags slice to live-common's `FeatureFlagsContext` so
 * live-common's own internal hooks resolve from the slice. Temporary: removed once those
 * hooks migrate off the Context.
 */
export const FeatureFlagsContextBridge = ({ children }: React.PropsWithChildren) => {
  const dispatch = useDispatch();
  const resolved = useSelector((state: WithFeatureFlags) => state.featureFlags.resolved);
  const { shouldDisplayGraphRework: isWallet40GraphReworkEnabled } =
    useWalletFeaturesConfig("desktop");

  const getFeature = useCallback(
    (key: FeatureId): Feature | null =>
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      (resolved[key as keyof typeof resolved] ?? null) as Feature | null,
    [resolved],
  );

  const isFeature = useCallback(
    (key: string): boolean => FeatureIdSchema.safeParse(key).success,
    [],
  );

  const overrideFeature = useCallback(
    (key: FeatureId, value: Feature): void => {
      const { overriddenByEnv, ...pureValue } = value; // eslint-disable-line
      dispatch(setOverride({ key, value: { ...pureValue, overridesRemote: true } }));
    },
    [dispatch],
  );

  const resetFeature = useCallback(
    (key: FeatureId): void => {
      dispatch(setOverride({ key, value: undefined }));
    },
    [dispatch],
  );

  const resetFeatures = useCallback((): void => {
    dispatch(setAllOverrides({}));
  }, [dispatch]);

  // Temporary until wallet 4.0 is 100% enabled: force the selected time range to "day"
  // once per launch when the graph rework is on.
  useEffect(() => {
    if (isWallet40GraphReworkEnabled) {
      dispatch(setSelectedTimeRange("day"));
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- run only once
  }, []);

  const contextValue = useMemo(
    () => ({ isFeature, getFeature, overrideFeature, resetFeature, resetFeatures }),
    [isFeature, getFeature, overrideFeature, resetFeature, resetFeatures],
  );

  return <FeatureFlagsProvider value={contextValue}>{children}</FeatureFlagsProvider>;
};
