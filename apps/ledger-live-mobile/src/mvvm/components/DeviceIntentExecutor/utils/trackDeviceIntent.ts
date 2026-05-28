import type { DeviceModelId } from "@ledgerhq/types-devices";
import { track } from "~/analytics";
import type { SourceFlow } from "../SourceFlowContext";

export const PAGE_CONNECT_DEVICE = {
  Discovering: "Connect Device - Discovering",
  WaitingForSelectedDevice: "Connect Device - Waiting For Device",
  Connecting: "Connect Device - Connecting",
} as const;

export const trackDeviceflowStarted = (params: { sourceFlow: SourceFlow }): void => {
  track("deviceflow_started", { sourceFlow: params.sourceFlow });
};

export const trackDevicePrompted = (params: { sourceFlow: SourceFlow }): void => {
  track("device_prompted", { sourceFlow: params.sourceFlow });
};

export const trackDeviceConnecting = (params: {
  sourceFlow: SourceFlow;
  modelId: DeviceModelId;
  transport: "ble" | "usb";
}): void => {
  track("device_connecting", {
    sourceFlow: params.sourceFlow,
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
    sourceFlow: params.sourceFlow,
    modelId: params.modelId,
    transport: params.transport,
    matchedDevice: params.modelId,
  });
};

export const trackAppReady = (params: { sourceFlow: SourceFlow; modelId: DeviceModelId }): void => {
  track("app_ready", {
    sourceFlow: params.sourceFlow,
    modelId: params.modelId,
  });
};

export const trackDeviceflowCompleted = (params: {
  sourceFlow: SourceFlow;
  modelId: DeviceModelId;
  transport: "ble" | "usb";
}): void => {
  track("deviceflow_completed", {
    sourceFlow: params.sourceFlow,
    modelId: params.modelId,
    transport: params.transport,
  });
};

export const trackDeviceflowAborted = (params: { sourceFlow: SourceFlow }): void => {
  track("deviceflow_aborted", { sourceFlow: params.sourceFlow });
};
