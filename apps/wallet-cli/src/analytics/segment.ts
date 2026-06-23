import { Analytics } from "@segment/analytics-node";
import os from "node:os";
import { randomUUID } from "node:crypto";
import pkg from "../../package.json" with { type: "json" };

export const WALLET_CLI_USER_ID = "wallet-cli";
export const WALLET_CLI_WRITE_KEY = "70VZSoB5kr9tiTHJMqKwxUjvZEPbrnBO";

const osType = os.type();
const osVersion = os.release();
const sessionId = randomUUID();

const getContext = () => ({
  ip: "0.0.0.0",
});

const extraProperties = () => ({
  appVersion: pkg.version,
  platform: "wallet-cli",
  osType,
  osVersion,
  sessionId,
});

type IdentifyParams = Parameters<Analytics["identify"]>[0];
type TrackParams = Parameters<Analytics["track"]>[0];

export type AnalyticsClient = {
  identify(params: IdentifyParams): void;
  track(params: TrackParams): void;
  closeAndFlush(): Promise<unknown>;
};

let analytics: AnalyticsClient | null = null;

export const startAnalytics = (): void => {
  if (analytics) return;

  analytics = new Analytics({ writeKey: WALLET_CLI_WRITE_KEY });
  analytics.identify({
    userId: WALLET_CLI_USER_ID,
    traits: extraProperties(),
    context: getContext(),
  });
};

export const track = (eventName: string, properties?: Record<string, unknown> | null): void => {
  if (!analytics) return;

  analytics.track({
    userId: WALLET_CLI_USER_ID,
    event: eventName,
    properties: {
      ...extraProperties(),
      ...(properties ?? {}),
    },
    context: getContext(),
  });
};

export const updateIdentify = (traits?: Record<string, unknown>): void => {
  if (!analytics) return;

  analytics.identify({
    userId: WALLET_CLI_USER_ID,
    traits: {
      ...extraProperties(),
      ...(traits ?? {}),
    },
    context: getContext(),
  });
};

export async function disposeAnalytics(): Promise<void> {
  const current = analytics;
  analytics = null;
  await current?.closeAndFlush();
}
