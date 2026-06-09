import React from "react";
import { useTranslation } from "react-i18next";

export function SearchOverlayDefault() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-24" data-testid="search-overlay-default">
      {/* CryptoList section (LIVE-29945): cryptos + stablecoins */}
      {/* Stocks section (LIVE-29946) */}
      {/* Perps section (LIVE-29947) */}
      <span className="body-2 text-muted">{t("topBar.searchEmptyState")}</span>
    </div>
  );
}
