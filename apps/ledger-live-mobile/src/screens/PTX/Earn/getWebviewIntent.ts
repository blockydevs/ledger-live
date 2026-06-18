import { safeUrl } from "@ledgerhq/live-common/wallet-api/helpers";

export type EarnWebviewIntent = "deposit" | "withdraw" | "simulate";

const INTENT_FLOWS = ["deposit", "withdraw", "simulate"] as const;
const INTENTS_SET = new Set<string>(INTENT_FLOWS);

export const isEarnWebviewIntent = (value: string | null | undefined): value is EarnWebviewIntent =>
  INTENTS_SET.has(value ?? "");

/** Reads the earn flow intent from a live-app webview URL (query param, then pathname). */
export const getWebviewIntent = (rawUrl?: string): EarnWebviewIntent | undefined => {
  if (!rawUrl) return undefined;
  const url = safeUrl(rawUrl);
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) return undefined;

  const queryIntent = url.searchParams.get("intent");
  if (isEarnWebviewIntent(queryIntent)) return queryIntent;

  if (url.pathname.includes("/deposit")) return "deposit";
  if (url.pathname.includes("/withdraw")) return "withdraw";
  if (url.pathname.includes("/earn-simulator")) return "simulate";

  return undefined;
};

export const getIntentFlowState = (rawUrl?: string): boolean | null => {
  if (!rawUrl) return null;
  const url = safeUrl(rawUrl);
  if (!url) return null;
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (isEarnWebviewIntent(url.searchParams.get("intent"))) return true;
  return INTENT_FLOWS.some(segment => url.pathname.includes(segment));
};
