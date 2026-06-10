import React from "react";
import { useWalletFeaturesConfig } from "@features/platform-feature-flags";
import useMarketBannerViewModel from "./hooks/useMarketBannerViewModel";
import MarketBannerView from "./components/MarketBannerView";
import { MarketBannerProps } from "./types";

const MarketBannerContent = ({ testID }: MarketBannerProps) => {
  const {
    items,
    isError,
    showFilter,
    bannerFilter,
    range,
    onTilePress,
    onViewAllPress,
    onSectionTitlePress,
  } = useMarketBannerViewModel();

  return (
    <MarketBannerView
      isError={isError}
      items={items}
      range={range}
      showFilter={showFilter}
      bannerFilter={bannerFilter}
      onTilePress={onTilePress}
      onViewAllPress={onViewAllPress}
      onSectionTitlePress={onSectionTitlePress}
      testID={testID}
    />
  );
};

const MarketBanner = ({ testID }: MarketBannerProps) => {
  const { shouldDisplayMarketBanner } = useWalletFeaturesConfig("mobile");

  // Gate before the data-heavy ViewModel so a disabled banner runs no data hooks.
  if (!shouldDisplayMarketBanner) {
    return null;
  }

  return <MarketBannerContent testID={testID} />;
};

export default React.memo(MarketBanner);
