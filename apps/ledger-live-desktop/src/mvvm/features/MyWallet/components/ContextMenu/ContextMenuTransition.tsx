import React, { useEffect, useRef } from "react";
import { cn } from "LLD/utils/cn";
import type { ContextMenuView } from "./types";

type ContextMenuTransitionProps = {
  view: ContextMenuView;
  children: React.ReactNode;
};

export function ContextMenuTransition({ view, children }: ContextMenuTransitionProps) {
  const prevViewRef = useRef(view);
  const shouldAnimate = prevViewRef.current !== view;

  useEffect(() => {
    prevViewRef.current = view;
  }, [view]);

  return (
    <div
      key={view}
      className={cn(
        "flex flex-col",
        view === "menu" && "gap-24",
        shouldAnimate &&
          (view === "backupHub" ? "animate-slide-in-from-right" : "animate-slide-in-from-left"),
      )}
    >
      {children}
    </div>
  );
}
