import * as React from "react";
import type { NotificationsState } from "~/reducers/types";
import Illustration from "~/images/illustration/Illustration";
import NotificationsBellDark from "~/images/illustration/Dark/_NotificationsBell.webp";
import NotificationsBellLight from "~/images/illustration/Light/_NotificationsBell.webp";
import NotificationsPerformanceChartDark from "~/images/illustration/Dark/_NotificationsPerformanceChart.webp";
import NotificationsPerformanceChartLight from "~/images/illustration/Light/_NotificationsPerformanceChart.webp";
import type { NotificationPromptTarget } from "../types";
import { isTransactionsAlertsPromptTarget } from "../utils/getNotificationsPromptCopy";

const WIDTH = 300;
const HEIGHT = 141;

export type NotificationsDrawerIllustrationProps = {
  readonly type: NotificationsState["drawerSource"];
  readonly promptTarget?: NotificationPromptTarget;
};

export function NotificationsDrawerIllustration({
  type,
  promptTarget,
}: NotificationsDrawerIllustrationProps) {
  const useBellIllustration =
    type === "onboarding" || isTransactionsAlertsPromptTarget(promptTarget);

  if (useBellIllustration) {
    return (
      <Illustration
        lightSource={NotificationsBellLight}
        darkSource={NotificationsBellDark}
        width={WIDTH}
        height={HEIGHT}
      />
    );
  }

  return (
    <Illustration
      lightSource={NotificationsPerformanceChartLight}
      darkSource={NotificationsPerformanceChartDark}
      width={WIDTH}
      height={HEIGHT}
    />
  );
}
