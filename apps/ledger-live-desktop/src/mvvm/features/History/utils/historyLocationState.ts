/** Passed when opening History from asset detail (see all transactions). */
export type HistoryLocationState = Readonly<{
  historyBackPath?: string;
}>;

function getPathname(path: string): string {
  const withoutQuery = path.split("?")[0] ?? path;
  return withoutQuery.split("#")[0] ?? withoutQuery;
}

function getSearch(path: string): string {
  const queryIndex = path.indexOf("?");
  if (queryIndex < 0) return "";
  const hashIndex = path.indexOf("#", queryIndex);
  const end = hashIndex < 0 ? path.length : hashIndex;
  return path.slice(queryIndex, end);
}

function isSafeInAppPath(path: string): boolean {
  if (!path.startsWith("/") || path.length === 0) return false;
  if (path.includes("..")) return false;
  return true;
}

/** Resolves in-app path for History back action; ignores unknown or unsafe state. */
export function parseHistoryBackPath(locationState: unknown): string | undefined {
  if (!locationState || typeof locationState !== "object") return undefined;
  if (!("historyBackPath" in locationState)) return undefined;
  const raw = locationState.historyBackPath;
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  if (!isSafeInAppPath(raw)) return undefined;
  const pathname = getPathname(raw);
  if (pathname === "/history") return undefined;
  return pathname + getSearch(raw);
}
