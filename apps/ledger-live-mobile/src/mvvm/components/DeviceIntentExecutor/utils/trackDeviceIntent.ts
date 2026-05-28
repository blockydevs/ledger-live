import type { DeviceModelId } from "@ledgerhq/types-devices";
import { track } from "~/analytics";
import { previousRouteNameRef } from "~/analytics/screenRefs";
import type { SourceFlow } from "./SourceFlowContext";

export const PAGE_CONNECT_DEVICE = {
  Discovering: "Connect Device - Discovering",
  WaitingForSelectedDevice: "Connect Device - Waiting For Device",
  Connecting: "Connect Device - Connecting",
} as const;

const getLayerABaseProperties = (sourceFlow: SourceFlow) => ({
  sourceFlow,
  source: previousRouteNameRef.current,
  deviceUxV2: true,
});

export const trackDeviceflowStarted = (params: { sourceFlow: SourceFlow }): void => {
  track("deviceflow_started", getLayerABaseProperties(params.sourceFlow));
};

export const trackDevicePrompted = (params: { sourceFlow: SourceFlow }): void => {
  track("device_prompted", getLayerABaseProperties(params.sourceFlow));
};

export const trackDeviceConnecting = (params: {
  sourceFlow: SourceFlow;
  modelId: DeviceModelId;
  transport: "ble" | "usb";
}): void => {
  track("device_connecting", {
    ...getLayerABaseProperties(params.sourceFlow),
    modelId: params.modelId,
    transport: params.transport,
    matchedDevice: params.modelId,
  });
};

export const trackDeviceConnected = (params: {
  sourceFlow: SourceFlow;
  modelId: DeviceModelId;
  transport: "ble" | "usb";
}): void => {
  track("device_connected", {
    ...getLayerABaseProperties(params.sourceFlow),
    modelId: params.modelId,
    transport: params.transport,
    matchedDevice: params.modelId,
  });
};

export const trackAppReady = (params: { sourceFlow: SourceFlow; modelId: DeviceModelId }): void => {
  track("app_ready", {
    ...getLayerABaseProperties(params.sourceFlow),
    modelId: params.modelId,
  });
};

export const trackDeviceflowCompleted = (params: {
  sourceFlow: SourceFlow;
  modelId: DeviceModelId;
  transport: "ble" | "usb";
}): void => {
  track("deviceflow_completed", {
    ...getLayerABaseProperties(params.sourceFlow),
    modelId: params.modelId,
    transport: params.transport,
  });
};

export const trackDeviceflowAborted = (params: { sourceFlow: SourceFlow }): void => {
  track("deviceflow_aborted", getLayerABaseProperties(params.sourceFlow));
};
