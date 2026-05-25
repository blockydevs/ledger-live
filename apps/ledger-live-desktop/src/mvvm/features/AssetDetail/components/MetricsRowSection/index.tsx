import React from "react";
import type { DistributionItem } from "@ledgerhq/types-live";
import { PnLSection } from "../PnL";
import { StakingSection } from "../StakingSection";
import { useMetricsRowSectionViewModel } from "./useMetricsRowSectionViewModel";

type MetricsRowSectionProps = Readonly<{
  distributionItem: DistributionItem;
}>;

export function MetricsRowSection({ distributionItem }: MetricsRowSectionProps) {
  const { shouldRenderSection, pnlVisible } = useMetricsRowSectionViewModel({ distributionItem });

  if (!shouldRenderSection) return null;

  return (
    <div className="flex items-stretch gap-12">
      <PnLSection distributionItem={distributionItem} />
      <StakingSection distributionItem={distributionItem} pnlVisible={pnlVisible} />
    </div>
  );
}
