import React from "react";
import { MarketTopCardsSection } from "./MarketTopCardsSection";
import { MarketTopCardPlaceholder } from "./components/MarketTopCardPlaceholder";
import { useMarketTopCardsViewModel } from "./hooks/useMarketTopCardsViewModel";

function MarketTopCards() {
  const { shouldRender } = useMarketTopCardsViewModel();

  if (!shouldRender) return null;

  return (
    <MarketTopCardsSection>
      <MarketTopCardPlaceholder testId="market-top-card-1" />
      <MarketTopCardPlaceholder testId="market-top-card-2" />
      <MarketTopCardPlaceholder testId="market-top-card-3" />
    </MarketTopCardsSection>
  );
}

export { MarketTopCardsSection };
export default MarketTopCards;
