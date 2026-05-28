import { DeviceModelId } from "@ledgerhq/types-devices";
import { track } from "~/analytics";
import {
  trackAppReady,
  trackDeviceConnected,
  trackDeviceConnecting,
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

describe("trackDeviceIntent — Layer A tracking helpers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("trackDeviceflowStarted", () => {
    describe("Given a sourceFlow", () => {
      describe("When called", () => {
        it("Then tracks deviceflow_started with sourceFlow only", () => {
          trackDeviceflowStarted({ sourceFlow: "swap" });

          expect(mockedTrack).toHaveBeenCalledTimes(1);
          expect(mockedTrack).toHaveBeenCalledWith("deviceflow_started", {
            sourceFlow: "swap",
          });
        });
      });
    });
  });

  describe("trackDevicePrompted", () => {
    describe("Given a sourceFlow", () => {
      describe("When called", () => {
        it("Then tracks device_prompted with sourceFlow only", () => {
          trackDevicePrompted({ sourceFlow: "send" });

          expect(mockedTrack).toHaveBeenCalledWith("device_prompted", {
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
        it("Then tracks deviceflow_aborted with sourceFlow only", () => {
          trackDeviceflowAborted({ sourceFlow: "my_ledger" });

          expect(mockedTrack).toHaveBeenCalledWith("deviceflow_aborted", {
            sourceFlow: "my_ledger",
          });
        });
      });
    });
  });
});
