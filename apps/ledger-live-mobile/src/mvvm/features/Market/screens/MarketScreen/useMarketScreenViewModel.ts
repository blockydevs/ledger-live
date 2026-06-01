import { useMemo } from "react";
import { useWindowDimensions } from "react-native";

const HORIZONTAL_PADDING = 16;
const CARD_GAP = 8;
const HIGHLIGHT_CARD_COUNT = 4;

export type MarketScreenHighlightCard = {
  key: string;
};

export type MarketScreenViewModel = {
  cardWidth: number;
  cardGap: number;
  snapToInterval: number;
  highlightCards: MarketScreenHighlightCard[];
};

/**
 * View model for the empty Market screen shell.
 *
 * Card sizing follows the design spec: two cards plus a peek of the third must
 * fit within the horizontal padding, so the width is half of the available row
 * minus half of the inter-card gap.
 */
export function useMarketScreenViewModel(): MarketScreenViewModel {
  const { width } = useWindowDimensions();

  return useMemo(() => {
    const cardWidth = (width - HORIZONTAL_PADDING * 2) / 2 - CARD_GAP;

    return {
      cardWidth,
      cardGap: CARD_GAP,
      snapToInterval: cardWidth + CARD_GAP,
      highlightCards: Array.from({ length: HIGHLIGHT_CARD_COUNT }, (_, index) => ({
        key: `market-highlight-${index}`,
      })),
    };
  }, [width]);
}
