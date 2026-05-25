import { useWalletFeaturesConfig } from "@ledgerhq/live-common/featureFlags/index";
import type { DistributionItem } from "@ledgerhq/types-live";

export function useShouldDisplayAssetPnl(distributionItem: DistributionItem): boolean {
  const { shouldDisplayPnl: isPnlFlagOn } = useWalletFeaturesConfig("desktop");
  return isPnlFlagOn && distributionItem.accounts.length > 0;
}
