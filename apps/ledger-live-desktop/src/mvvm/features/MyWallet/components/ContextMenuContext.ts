import { createContext, useContext } from "react";
import type { ContextMenuProviderValue } from "./ContextMenu/types";

const ContextMenuContext = createContext<ContextMenuProviderValue | null>(null);

function useContextMenu() {
  const ctx = useContext(ContextMenuContext);
  if (!ctx) {
    throw new Error("ContextMenu hooks must be used within a ContextMenu");
  }
  return ctx;
}

/**
 * Returns the `close` function from the nearest ContextMenu provider.
 * Call it from any child inside the popover to dismiss the menu after an action.
 */
export function useContextMenuClose() {
  return useContextMenu().close;
}

export function useContextMenuNavigation() {
  const { view, navigateTo, goBack } = useContextMenu();
  return { view, navigateTo, goBack };
}

export default ContextMenuContext;
