import React from "react";
import MarketInsightGauge from "LLM/components/MarketInsightGauge";
import type { FearAndGreedAppearance } from "../../types";

const GRADIENT_START_COLOR = "#F87274";
const GRADIENT_END_COLOR = "#6EC85C";

type Props = Readonly<{
  value: number;
  appearance?: FearAndGreedAppearance;
}>;

export default function FearAndGreedArc({ value, appearance = "compact" }: Props) {
  return (
    <MarketInsightGauge
      value={value}
      appearance={appearance}
      gradientId={`fearAndGreedGradient-${appearance}`}
      gradientStartColor={GRADIENT_START_COLOR}
      gradientEndColor={GRADIENT_END_COLOR}
    />
  );
}
