import React from "react";
import { useTranslation } from "react-i18next";
import { AssetDetailView } from "./AssetDetailView";
import { ScrubbedPriceProvider } from "./context/ScrubbedPriceContext";
import { useAssetDetailViewModel } from "./hooks/useAssetDetailViewModel";

const AssetDetail = () => {
  const { t } = useTranslation();
  const viewModel = useAssetDetailViewModel();

  if (viewModel.mode === "not-found") {
    return (
      <section className="rounded-16 border border-dashed border-neutral-c70/30 p-16 text-body text-neutral-c70">
        {t("assetDetails.notFound")}
      </section>
    );
  }

  return (
    <ScrubbedPriceProvider>
      <AssetDetailView viewModel={viewModel} />
    </ScrubbedPriceProvider>
  );
};

export default AssetDetail;
