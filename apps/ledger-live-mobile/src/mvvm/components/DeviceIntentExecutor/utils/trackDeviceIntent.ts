import type { TransportIdentifier } from "@ledgerhq/device-management-kit";
import { rnHidTransportIdentifier } from "@ledgerhq/device-transport-kit-react-native-hid";
import type { DeviceModelId } from "@ledgerhq/types-devices";
import { ConnectionErrorTypes, DiscoveryErrorTypes } from "@ledgerhq/live-dmk-mobile";
import { track } from "~/analytics";
import { previousRouteNameRef } from "~/analytics/screenRefs";
import type { SourceFlow } from "./SourceFlowContext";

export const PAGE_CONNECT_DEVICE = {
  NoKnownDevice: "Connect Device - No Known Device",
  Discovering: "Connect Device - Discovering",
  WaitingForSelectedDevice: "Connect Device - Waiting For Device",
  Connecting: "Connect Device - Connecting",
  DiscoveryError: "Connect Device - Discovery Error",
  ConnectionError: "Connect Device - Connection Error",
} as const;

export type TrackingTransport = "ble" | "usb";
type ConnectDeviceErrorType = ConnectionErrorTypes | DiscoveryErrorTypes;

const TRACKING_SUB_ERRORS: Record<ConnectDeviceErrorType, string> = {
  [DiscoveryErrorTypes.BluetoothPermissionDeniedPromptable]: "BluetoothPermissionDeniedPromptable",
  [DiscoveryErrorTypes.BluetoothPermissionDeniedManualSettings]:
    "BluetoothPermissionDeniedManualSettings",
  [DiscoveryErrorTypes.BluetoothPermissionUnauthorizedManualSettings]:
    "BluetoothPermissionUnauthorizedManualSettings",
  [DiscoveryErrorTypes.BluetoothDisabledPromptable]: "BluetoothDisabledPromptable",
  [DiscoveryErrorTypes.BluetoothDisabledManualAction]: "BluetoothDisabledManualAction",
  [DiscoveryErrorTypes.BluetoothStateUnknownCheckOnly]: "BluetoothStateUnknownCheckOnly",
  [DiscoveryErrorTypes.BluetoothUnsupported]: "BluetoothUnsupported",
  [DiscoveryErrorTypes.LocationPermissionDeniedPromptable]: "LocationPermissionDeniedPromptable",
  [DiscoveryErrorTypes.LocationPermissionDeniedManualSettings]:
    "LocationPermissionDeniedManualSettings",
  [DiscoveryErrorTypes.LocationDisabledPromptable]: "LocationDisabledPromptable",
  [DiscoveryErrorTypes.LocationDisabledManualAction]: "LocationDisabledManualAction",
  [DiscoveryErrorTypes.LocationServicePermissionMissing]: "LocationServicePermissionMissing",
  [DiscoveryErrorTypes.Unknown]: "Unknown",
  [ConnectionErrorTypes.BlePairingRefused]: "BlePairingRefused",
  [ConnectionErrorTypes.BlePairingPeerRemovedPairing]: "BlePairingPeerRemovedPairing",
};

export const getDeviceUxV2BaseProperties = (sourceFlow: SourceFlow) => ({
  sourceFlow,
  source: previousRouteNameRef.current,
  deviceUxV2: true,
});

export const getTrackingTransport = (
  transportId: TransportIdentifier | undefined,
): TrackingTransport | undefined => {
  if (!transportId) return undefined;
  return transportId === rnHidTransportIdentifier ? "usb" : "ble";
};

export const getTrackingSubError = (errorType: ConnectDeviceErrorType): string =>
  TRACKING_SUB_ERRORS[errorType];

export const trackDeviceflowStarted = (params: { sourceFlow: SourceFlow }): void => {
  track("deviceflow_started", getDeviceUxV2BaseProperties(params.sourceFlow));
};

export const trackDevicePrompted = (params: { sourceFlow: SourceFlow }): void => {
  track("device_prompted", getDeviceUxV2BaseProperties(params.sourceFlow));
};

export const trackDeviceConnecting = (params: {
  sourceFlow: SourceFlow;
  modelId: DeviceModelId;
  transport: "ble" | "usb";
}): void => {
  track("device_connecting", {
    ...getDeviceUxV2BaseProperties(params.sourceFlow),
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
    ...getDeviceUxV2BaseProperties(params.sourceFlow),
    modelId: params.modelId,
    transport: params.transport,
    matchedDevice: params.modelId,
  });
};

export const trackAppReady = (params: { sourceFlow: SourceFlow; modelId: DeviceModelId }): void => {
  track("app_ready", {
    ...getDeviceUxV2BaseProperties(params.sourceFlow),
    modelId: params.modelId,
  });
};

export const trackDeviceflowCompleted = (params: {
  sourceFlow: SourceFlow;
  modelId: DeviceModelId;
  transport: "ble" | "usb";
}): void => {
  track("deviceflow_completed", {
    ...getDeviceUxV2BaseProperties(params.sourceFlow),
    modelId: params.modelId,
    transport: params.transport,
  });
};

export const trackDeviceflowAborted = (params: { sourceFlow: SourceFlow }): void => {
  track("deviceflow_aborted", getDeviceUxV2BaseProperties(params.sourceFlow));
};

export const trackDeviceSelected = (params: {
  sourceFlow: SourceFlow;
  modelId: DeviceModelId;
}): void => {
  track("device_selected", {
    ...getDeviceUxV2BaseProperties(params.sourceFlow),
    modelId: params.modelId,
  });
};

export const trackConnectDeviceButtonClicked = (params: {
  sourceFlow: SourceFlow;
  button: string;
}): void => {
  track("button_clicked", {
    ...getDeviceUxV2BaseProperties(params.sourceFlow),
    button: params.button,
  });
};
