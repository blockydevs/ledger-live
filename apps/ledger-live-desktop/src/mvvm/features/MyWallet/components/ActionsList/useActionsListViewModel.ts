import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import {
  Gift,
  LifeRing,
  ShieldCheck,
  ShieldCheckNotification,
} from "@ledgerhq/lumen-ui-react/symbols";
import { useFeature } from "@features/platform-feature-flags";
import { useRecoverEntry } from "LLD/hooks/useRecoverEntry";
import { track } from "~/renderer/analytics/segment";
import type { Action } from "./types";
import { useContextMenuClose } from "../ContextMenuContext";
import { MY_WALLET_TRACKING_BUTTON, MY_WALLET_TRACKING_PAGE_NAME } from "../../constants";

export type ActionsListParams = {
  onRecoverClick: () => void;
};

export type ActionsListViewModel = {
  actions: Action[];
};

export function useActionsListViewModel({
  onRecoverClick,
}: ActionsListParams): ActionsListViewModel {
  const close = useContextMenuClose();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const referralProgramConfig = useFeature("referralProgramDesktopSidebar");
  const { recoverFeature, hasClickedRecover } = useRecoverEntry();
  const recoverIcon = hasClickedRecover ? ShieldCheck : ShieldCheckNotification;

  const openHelp = useCallback(() => {
    track("button_clicked", {
      button: MY_WALLET_TRACKING_BUTTON.help,
      page: MY_WALLET_TRACKING_PAGE_NAME,
    });
    navigate("/settings/help");
    close();
  }, [navigate, close]);

  const handleClickRefer = useCallback(() => {
    if (referralProgramConfig?.enabled && referralProgramConfig?.params?.path) {
      navigate(referralProgramConfig.params.path);
      track("button_clicked", {
        button: MY_WALLET_TRACKING_BUTTON.referral,
        page: MY_WALLET_TRACKING_PAGE_NAME,
      });
    }
    close();
  }, [referralProgramConfig, navigate, close]);

  const actions: Action[] = [
    ...(recoverFeature?.enabled
      ? [
          {
            icon: recoverIcon,
            label: t("myWallet.actionsList.recover"),
            onClick: onRecoverClick,
            id: "recover",
          },
        ]
      : []),
    {
      icon: LifeRing,
      label: t("myWallet.actionsList.help"),
      onClick: openHelp,
      id: "help",
    },
    ...(referralProgramConfig?.enabled
      ? [
          {
            icon: Gift,
            label: t("myWallet.actionsList.refer"),
            onClick: handleClickRefer,
            id: "refer",
          },
        ]
      : []),
  ];

  return { actions };
}
