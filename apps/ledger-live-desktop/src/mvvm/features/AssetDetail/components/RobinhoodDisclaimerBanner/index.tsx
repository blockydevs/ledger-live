import React from "react";
import { Banner } from "@ledgerhq/lumen-ui-react";
import { useTranslation } from "react-i18next";
import type { DistributionItem } from "@ledgerhq/types-live";
import { isRobinhoodExclusiveAsset } from "@ledgerhq/asset-detail";
import { useFeature } from "@features/platform-feature-flags";
import { useReceiveNetworkLedgerIds } from "../../hooks/useReceiveNetworkLedgerIds";

type RobinhoodDisclaimerBannerProps = Readonly<{
  distributionItem?: DistributionItem;
}>;

export function RobinhoodDisclaimerBanner({ distributionItem }: RobinhoodDisclaimerBannerProps) {
  const { t } = useTranslation();
  const robinhoodDisclaimer = useFeature("llRobinhoodDisclaimer");

  const networkLedgerIds = useReceiveNetworkLedgerIds({
    metaCurrencyId: distributionItem?.metaCurrencyId,
    marketApiId: distributionItem?.marketId,
    ticker: distributionItem?.currency.ticker,
    currencyId: distributionItem?.currency.id,
    fallbackLedgerIds: [],
  });

  const hasPositiveBalance = (distributionItem?.amount ?? 0) > 0;
  const show =
    !!robinhoodDisclaimer?.enabled &&
    hasPositiveBalance &&
    isRobinhoodExclusiveAsset(networkLedgerIds);

  if (!show) return null;

  return (
    <Banner
      appearance="info"
      title={t("assetDetails.robinhoodDisclaimerBanner.title")}
      data-testid="asset-detail-robinhood-disclaimer-banner"
    />
  );
}
