import React from "react";
import type { DistributionItem } from "@ledgerhq/types-live";
import { PnLCard } from "LLD/features/PnL/components/PnLCard";
import { PnlDetail } from "LLD/features/PnL/components/PnlDetail";
import { useAssetPnlViewModel } from "./useAssetPnlViewModel";

type Props = Readonly<{
  distributionItem: DistributionItem;
}>;

export function PnLSection({ distributionItem }: Props) {
  const viewModel = useAssetPnlViewModel({ distributionItem });
  if (!viewModel.shouldDisplayPnl) return null;

  return (
    <>
      {viewModel.items.map(item => (
        <div key={item.id} className="min-w-0 flex-1">
          <PnLCard {...item} />
        </div>
      ))}
      <PnlDetail
        open={viewModel.dialog.isOpen}
        onOpenChange={viewModel.dialog.onOpenChange}
        {...viewModel.detail}
      />
    </>
  );
}
