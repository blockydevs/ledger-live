import { useCallback, useMemo, useState } from "react";
import { BigNumber } from "bignumber.js";
import { useWalletFeaturesConfig } from "@ledgerhq/live-common/featureFlags/index";
import { formatCurrencyUnit } from "@ledgerhq/live-common/currencies/index";
import { useSelector } from "~/context/hooks";
import { useLocale, useTranslation } from "~/context/Locale";
import { counterValueCurrencySelector, discreetModeSelector } from "~/reducers/settings";
import { buildUnrealisedReturnCard } from "../builders/buildUnrealisedReturnCard";
import { buildSecondaryCard } from "../builders/buildSecondaryCard";
import { buildPnlDetail } from "../builders/buildPnlDetail";
import type { PnlNamespace, PnlNumbers, PnlSecondaryCardConfig, PnlViewModel } from "../types";

const ZERO = new BigNumber(0);

type Drawer = "pnl" | "secondary" | null;

export type UsePnlViewModelBaseInput = {
  namespace: PnlNamespace;
  pnlData: PnlNumbers | null;
  secondaryCard: PnlSecondaryCardConfig;
  accountsCount: number;
};

export function usePnlViewModelBase({
  namespace,
  pnlData,
  secondaryCard,
  accountsCount,
}: UsePnlViewModelBaseInput): PnlViewModel {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { shouldDisplayPnl: isPnlFlagOn } = useWalletFeaturesConfig("mobile");
  const fiat = useSelector(counterValueCurrencySelector);
  const discreet = useSelector(discreetModeSelector);
  const [openDrawer, setOpenDrawer] = useState<Drawer>(null);

  const { unrealisedPnL = ZERO, realisedPnL = ZERO, totalPnL = ZERO } = pnlData ?? {};

  const formatFiat = useCallback(
    (value: BigNumber, alwaysShowSign?: boolean) =>
      formatCurrencyUnit(fiat.units[0], value, {
        showCode: true,
        locale,
        discreet,
        alwaysShowSign,
      }),
    [fiat, locale, discreet],
  );

  const openPnlDrawer = useCallback(() => setOpenDrawer("pnl"), []);
  const openSecondaryDrawer = useCallback(() => setOpenDrawer("secondary"), []);
  const closeDrawer = useCallback(() => setOpenDrawer(null), []);

  const unrealised = useMemo(
    () =>
      buildUnrealisedReturnCard({
        namespace,
        unrealisedPnL,
        formatFiat,
        onPress: openPnlDrawer,
        t,
      }),
    [namespace, unrealisedPnL, formatFiat, openPnlDrawer, t],
  );

  const secondary = useMemo(
    () =>
      buildSecondaryCard({
        ...secondaryCard,
        formatFiat,
        onPress: openSecondaryDrawer,
        t,
      }),
    [secondaryCard, formatFiat, openSecondaryDrawer, t],
  );

  const detail = useMemo(
    () => buildPnlDetail({ namespace, totalPnL, unrealisedPnL, realisedPnL, formatFiat, t }),
    [namespace, totalPnL, unrealisedPnL, realisedPnL, formatFiat, t],
  );

  return {
    shouldDisplayPnl: isPnlFlagOn && accountsCount > 0,
    unrealised,
    secondary,
    pnlDrawer: {
      isOpen: openDrawer === "pnl",
      onClose: closeDrawer,
      title: detail.title,
      description: detail.description,
      items: detail.items,
      footer: t("pnl.disclaimer"),
    },
    secondaryDrawer: {
      isOpen: openDrawer === "secondary",
      onClose: closeDrawer,
      title: t(secondaryCard.titleKey),
      bodyText: t(secondaryCard.tooltipKey),
    },
  };
}
