import type { BigNumber } from "bignumber.js";
import { TriangleUp, TriangleDown } from "@ledgerhq/lumen-ui-react/symbols";
import { type PnlTrend, trendFromSign } from "@ledgerhq/wallet-pnl";
import type { TrendIconConfig } from "../components/PnLCard/types";

const ICONS: Record<PnlTrend, TrendIconConfig> = {
  up: { Icon: TriangleUp, className: "text-success" },
  down: { Icon: TriangleDown, className: "text-error" },
  neutral: { Icon: TriangleUp, className: "text-disabled" },
};

export function getTrendIcon(value: BigNumber): TrendIconConfig {
  return ICONS[trendFromSign(value)];
}
