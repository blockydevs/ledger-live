import React from "react";
import type { DistributionItem } from "@ledgerhq/types-live";
import { PnLSection } from "../PnL";
import { StakingSection } from "../StakingSection";
import { useMetricsRowSectionViewModel } from "./useMetricsRowSectionViewModel";

type MetricsRowSectionProps = Readonly<{
  distributionItem: DistributionItem;
  portfolioDistributionItem?: DistributionItem;
  sectionLoading: boolean;
}>;

export function MetricsRowSection({
  distributionItem,
  portfolioDistributionItem,
  sectionLoading,
}: MetricsRowSectionProps) {
  const { shouldRenderSection } = useMetricsRowSectionViewModel({ distributionItem });

  if (!shouldRenderSection && !sectionLoading) return null;

  return (
    <div className="flex items-stretch gap-12">
      <PnLSection
        distributionItem={portfolioDistributionItem}
        isLoading={sectionLoading}
      />
      <StakingSection distributionItem={distributionItem} isLoading={sectionLoading} />
    </div>
  );
}
