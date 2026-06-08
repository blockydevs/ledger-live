import { useCallback, useMemo, useState } from "react";
import { useLocation } from "react-router";
import { track } from "~/renderer/analytics/segment";
import { currentRouteNameRef } from "~/renderer/analytics/screenRefs";
import type { ContextMenuView, ContextMenuViewProps } from "../types";
import { MY_WALLET_TRACKING_BUTTON } from "../../../constants";

export function useContextMenuViewModel(): ContextMenuViewProps {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ContextMenuView>("menu");
  const location = useLocation();

  const close = useCallback(() => setOpen(false), []);

  const navigateTo = useCallback((next: ContextMenuView) => setView(next), []);
  const goBack = useCallback(() => setView("menu"), []);

  const contextValue = useMemo(
    () => ({ close, view, navigateTo, goBack }),
    [close, view, navigateTo, goBack],
  );

  const onOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (nextOpen) {
        setView("menu");
        track("button_clicked", {
          button: MY_WALLET_TRACKING_BUTTON.menu,
          page: currentRouteNameRef.current ?? location.pathname,
        });
      }
    },
    [location.pathname],
  );

  return {
    open,
    onOpenChange,
    contextValue,
  };
}
