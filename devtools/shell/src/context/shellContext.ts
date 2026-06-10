import { createContext, createElement, useContext } from "react";
import type { ReactNode } from "react";
import type { Category, Tool } from "@devtools/registry";

export interface CategoryGroup {
  readonly category: Category;
  readonly tools: Tool[];
}

interface DevToolsShellValue {
  readonly categories: CategoryGroup[];
  readonly onQuit?: () => void;
}

const DevToolsShellContext = createContext<DevToolsShellValue>({ categories: [] });

export function DevToolsShellProvider({
  value,
  children,
}: {
  value: DevToolsShellValue;
  children: ReactNode;
}) {
  return createElement(DevToolsShellContext.Provider, { value }, children);
}

export function useDevToolsShell(): DevToolsShellValue {
  return useContext(DevToolsShellContext);
}
