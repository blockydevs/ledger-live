import type { BigNumber } from "bignumber.js";
import type { PnlTrend } from "@ledgerhq/wallet-pnl";
import type { PnlDetailItem } from "./components/PnlDetailDrawer/types";

export type { PnlTrend };

export type PnlNamespace = "pnl.asset" | "pnl.portfolio";

export type PnlNumbers = {
  unrealisedPnL: BigNumber;
  realisedPnL: BigNumber;
  totalPnL: BigNumber;
};

export type PnlSecondaryCardConfig = {
  id: string;
  titleKey: string;
  /** i18n key for the body text shown when the secondary card opens its drawer. */
  tooltipKey: string;
  value: BigNumber;
};

export type PnlCardViewModel = {
  title: string;
  value: string;
  onPress: () => void;
};

export type PnlDrawerViewModel = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
};

export type PnlViewModel = {
  shouldDisplayPnl: boolean;
  unrealised: PnlCardViewModel & { trend: PnlTrend };
  secondary: PnlCardViewModel;
  pnlDrawer: PnlDrawerViewModel & {
    description: string;
    items: PnlDetailItem[];
    footer: string;
  };
  secondaryDrawer: PnlDrawerViewModel & { bodyText: string };
};
