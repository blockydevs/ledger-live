import React from "react";
import { render, screen } from "@tests/test-renderer";
import { ConnectDeviceUIStateTypes } from "@ledgerhq/live-dmk-mobile";
import { DeviceModelId } from "@ledgerhq/types-devices";
import type { KnownDevice } from "@ledgerhq/live-dmk-shared";
import { SourceFlowProvider } from "../../SourceFlowContext";
import { ConnectingState } from "./ConnectingState";

function makeKnownDevice(overrides: Partial<KnownDevice> = {}): KnownDevice {
  return {
    id: "device-id",
    name: "Ledger Nano X",
    deviceModelId: DeviceModelId.nanoX,
    transport: "ble" as KnownDevice["transport"],
    ...overrides,
  };
}

describe("ConnectingState", () => {
  it("should render the connecting title", () => {
    render(
      <SourceFlowProvider value="my_ledger">
        <ConnectingState
          state={{ type: ConnectDeviceUIStateTypes.Connecting, device: makeKnownDevice() }}
        />
      </SourceFlowProvider>,
    );

    expect(screen.getByText("Loading")).toBeVisible();
  });
});
