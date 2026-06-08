import React from "react";
import { useFearAndGreedViewModel } from "LLD/features/FearAndGreed/hooks/useFearAndGreedViewModel";
import { MarketTopCardPlaceholder } from "../MarketTopCardPlaceholder";
import { MoodIndexCardView } from "./MoodIndexCardView";

export function MoodIndexCard() {
  const { data, isError, isLoading } = useFearAndGreedViewModel();

  if (isLoading) {
    return <MarketTopCardPlaceholder testId="market-top-card-2" />;
  }

  // Scoped error: keep the row intact, just don't render this card.
  if (isError || !data) {
    return null;
  }

  return <MoodIndexCardView data={data} />;
}
