import React from "react";
import MarketInsightGauge from "LLM/components/MarketInsightGauge";

const GRADIENT_START_COLOR = "#FF9416";
const GRADIENT_END_COLOR = "#3F51B5";

type Props = Readonly<{
  value: number;
}>;

export function AltcoinSeasonArc({ value }: Props) {
  return (
    <MarketInsightGauge
      value={value}
      appearance="expanded"
      gradientId="altcoinSeasonGradient"
      gradientStartColor={GRADIENT_START_COLOR}
      gradientEndColor={GRADIENT_END_COLOR}
    />
  );
}
