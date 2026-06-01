import type { TransportIdentifier } from "@ledgerhq/device-management-kit";
import { rnHidTransportIdentifier } from "@ledgerhq/device-transport-kit-react-native-hid";
import { ConnectionErrorTypes, DiscoveryErrorTypes } from "@ledgerhq/live-dmk-mobile";
import { DeviceModelId } from "@ledgerhq/types-devices";
import { track } from "~/analytics";
import { previousRouteNameRef } from "~/analytics/screenRefs";
import {
  getTrackingSubError,
  getTrackingTransport,
  trackConnectAppButtonClicked,
  trackConnectDeviceButtonClicked,
  trackAppReady,
  trackDeviceConnected,
  trackDeviceConnecting,
  trackDeviceSelected,
  trackDeviceflowAborted,
  trackDeviceflowCompleted,
  trackDeviceflowStarted,
  trackDevicePrompted,
} from "./trackDeviceIntent";

jest.mock("~/analytics", () => {
  const actual = jest.requireActual("~/analytics");
  return {
    ...actual,
    track: jest.fn(),
  };
});

const mockedTrack = jest.mocked(track);
const TEST_SOURCE = "Portfolio";
const TEST_BLE_TRANSPORT = "RN_BLE" as TransportIdentifier;

const layerABaseProperties = {
  source: TEST_SOURCE,
  deviceUxV2: true,
};

describe("trackDeviceIntent — Layer A tracking helpers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    previousRouteNameRef.current = TEST_SOURCE;
  });

  describe("trackDeviceflowStarted", () => {
    describe("Given a sourceFlow", () => {
      describe("When called", () => {
        it("Then tracks deviceflow_started with the Layer A base properties", () => {
          trackDeviceflowStarted({ sourceFlow: "swap" });

          expect(mockedTrack).toHaveBeenCalledTimes(1);
          expect(mockedTrack).toHaveBeenCalledWith("deviceflow_started", {
            ...layerABaseProperties,
            sourceFlow: "swap",
          });
        });
      });
    });
  });

  describe("trackDevicePrompted", () => {
    describe("Given a sourceFlow", () => {
      describe("When called", () => {
        it("Then tracks device_prompted with the Layer A base properties", () => {
          trackDevicePrompted({ sourceFlow: "send" });

          expect(mockedTrack).toHaveBeenCalledWith("device_prompted", {
            ...layerABaseProperties,
            sourceFlow: "send",
          });
        });
      });
    });
  });

  describe("trackDeviceConnecting", () => {
    describe("Given the full connecting info", () => {
      describe("When called", () => {
        it("Then tracks device_connecting with sourceFlow, modelId, transport and matchedDevice", () => {
          trackDeviceConnecting({
            sourceFlow: "earn",
            modelId: DeviceModelId.nanoX,
            transport: "ble",
          });

          expect(mockedTrack).toHaveBeenCalledWith("device_connecting", {
            ...layerABaseProperties,
            sourceFlow: "earn",
            modelId: DeviceModelId.nanoX,
            transport: "ble",
            matchedDevice: DeviceModelId.nanoX,
          });
        });
      });
    });
  });

  describe("trackDeviceConnected", () => {
    describe("Given the full connection info", () => {
      describe("When called", () => {
        it("Then tracks device_connected with sourceFlow, modelId, transport and matchedDevice", () => {
          trackDeviceConnected({
            sourceFlow: "wallet_connect",
            modelId: DeviceModelId.stax,
            transport: "ble",
          });

          expect(mockedTrack).toHaveBeenCalledWith("device_connected", {
            ...layerABaseProperties,
            sourceFlow: "wallet_connect",
            modelId: DeviceModelId.stax,
            transport: "ble",
            matchedDevice: DeviceModelId.stax,
          });
        });
      });
    });
  });

  describe("trackAppReady", () => {
    describe("Given a sourceFlow and modelId", () => {
      describe("When called", () => {
        it("Then tracks app_ready with sourceFlow and modelId", () => {
          trackAppReady({
            sourceFlow: "add_account",
            modelId: DeviceModelId.nanoSP,
          });

          expect(mockedTrack).toHaveBeenCalledWith("app_ready", {
            ...layerABaseProperties,
            sourceFlow: "add_account",
            modelId: DeviceModelId.nanoSP,
          });
        });
      });
    });
  });

  describe("trackDeviceflowCompleted", () => {
    describe("Given full completion info", () => {
      describe("When called", () => {
        it("Then tracks deviceflow_completed with sourceFlow, modelId and transport", () => {
          trackDeviceflowCompleted({
            sourceFlow: "onboarding",
            modelId: DeviceModelId.europa,
            transport: "usb",
          });

          expect(mockedTrack).toHaveBeenCalledWith("deviceflow_completed", {
            ...layerABaseProperties,
            sourceFlow: "onboarding",
            modelId: DeviceModelId.europa,
            transport: "usb",
          });
        });
      });
    });
  });

  describe("trackDeviceflowAborted", () => {
    describe("Given a sourceFlow", () => {
      describe("When called", () => {
        it("Then tracks deviceflow_aborted with the Layer A base properties", () => {
          trackDeviceflowAborted({ sourceFlow: "my_ledger" });

          expect(mockedTrack).toHaveBeenCalledWith("deviceflow_aborted", {
            ...layerABaseProperties,
            sourceFlow: "my_ledger",
          });
        });
      });
    });
  });

  describe("getTrackingSubError", () => {
    describe("Given a Connect Device error type", () => {
      describe("When called", () => {
        it("Then returns the mapped PascalCase subError value", () => {
          expect(getTrackingSubError(DiscoveryErrorTypes.BluetoothDisabledPromptable)).toBe(
            "BluetoothDisabledPromptable",
          );
          expect(getTrackingSubError(ConnectionErrorTypes.BlePairingPeerRemovedPairing)).toBe(
            "BlePairingPeerRemovedPairing",
          );
        });
      });
    });
  });

  describe("getTrackingTransport", () => {
    describe("Given a transport id", () => {
      describe("When called", () => {
        it("Then maps HID to usb, other transports to ble, and keeps unknown transport undefined", () => {
          expect(getTrackingTransport(rnHidTransportIdentifier)).toBe("usb");
          expect(getTrackingTransport(TEST_BLE_TRANSPORT)).toBe("ble");
          expect(getTrackingTransport(undefined)).toBeUndefined();
        });
      });
    });
  });

  describe("trackDeviceSelected", () => {
    describe("Given a sourceFlow and a known device", () => {
      describe("When called", () => {
        it("Then tracks device_selected with the modelId and transport derived from the device", () => {
          trackDeviceSelected({
            sourceFlow: "receive",
            device: {
              id: "device-id",
              name: "Ledger Nano S",
              deviceModelId: DeviceModelId.nanoS,
              transport: TEST_BLE_TRANSPORT,
            },
          });

          expect(mockedTrack).toHaveBeenCalledWith("device_selected", {
            ...layerABaseProperties,
            sourceFlow: "receive",
            modelId: DeviceModelId.nanoS,
            transport: "ble",
          });
        });
      });
    });
  });

  describe("trackConnectDeviceButtonClicked", () => {
    describe("Given a sourceFlow and button", () => {
      describe("When called", () => {
        it("Then tracks button_clicked with the Layer B properties", () => {
          trackConnectDeviceButtonClicked({
            sourceFlow: "send",
            button: "Retry",
          });

          expect(mockedTrack).toHaveBeenCalledWith("button_clicked", {
            ...layerABaseProperties,
            sourceFlow: "send",
            button: "Retry",
          });
        });
      });
    });
  });

  describe("trackConnectAppButtonClicked", () => {
    it("GIVEN sourceFlow modelId and button WHEN called THEN it tracks button_clicked with the Layer B properties", () => {
      trackConnectAppButtonClicked({
        sourceFlow: "send",
        modelId: DeviceModelId.stax,
        button: "Retry",
      });

      expect(mockedTrack).toHaveBeenCalledWith("button_clicked", {
        ...layerABaseProperties,
        sourceFlow: "send",
        modelId: DeviceModelId.stax,
        button: "Retry",
      });
    });
  });
});
