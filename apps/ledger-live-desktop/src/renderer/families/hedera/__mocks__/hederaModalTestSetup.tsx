import React from "react";
import { DeviceModelId } from "@ledgerhq/types-devices";
import type { Device } from "@ledgerhq/live-common/hw/actions/types";
import type { Account } from "@ledgerhq/types-live";
import { getAccountBridge } from "@ledgerhq/live-common/bridge/index";
import { importLLDCoinFamily } from "~/renderer/families";

// Shared scaffolding for the ReceiveWithAssociationModal / DelegationFlowModal desktop
// integration tests. Lives in __mocks__ (not __integrations__) so it can be `require()`d
// from inside a hoisted jest.mock() factory, which cannot close over out-of-scope variables:
// `jest.mock(path, () => require(".../hederaModalTestSetup").someExport)`.

// -- DeviceAction --
//
// Precedent: canton/PendingTransferProposals/__integrations__ - stub only the device widget,
// keep everything downstream of `onResult` real. Renders both a success and an error button
// in one component (unlike the mobile version), so there's no per-file payload to parameterize.

// Records every `request` prop DeviceAction is rendered with, so tests can assert the actual
// transaction handed to the signer (mode, validator, token) — the flow's real output — instead
// of only the synthetic signed operation. Assert on the LAST call: the step re-renders.
export const deviceActionRequestSpy = jest.fn();

export const deviceActionModuleMock = {
  __esModule: true,
  default: ({
    onResult,
    request,
  }: {
    onResult?: (
      result: { signedOperation: { id: string }; device: Device } | { transactionSignError: Error },
    ) => void;
    request?: unknown;
  }) => {
    deviceActionRequestSpy(request);
    return (
      <div>
        <button
          type="button"
          data-testid="mock-device-confirm-success"
          onClick={() =>
            onResult?.({
              signedOperation: { id: "signed-op-1" },
              device: {
                deviceId: "test-device-id",
                modelId: DeviceModelId.nanoSP,
                wired: false,
              },
            })
          }
        >
          Confirm on device
        </button>
        <button
          type="button"
          data-testid="mock-device-confirm-error"
          onClick={() =>
            onResult?.({
              transactionSignError: new Error("device sign rejected"),
            })
          }
        >
          Reject on device
        </button>
      </div>
    );
  },
};

// -- mockDevice --

export const mockDevice: Device = {
  deviceId: "test-device-id",
  modelId: DeviceModelId.nanoSP,
  wired: false,
};

// -- useBroadcast --

// SECURITY: desktop has no network blocking in its jest setup, so an unmocked broadcast
// would fire a real write against Hedera mainnet from CI. Must always be mocked.
export const mockBroadcast = jest.fn();

export const useBroadcastModuleMock = {
  useBroadcast: () => mockBroadcast,
};

// -- modals DOM container --

export function setUpModalsContainer() {
  const modalsDiv = document.createElement("div");
  modalsDiv.id = "modals";
  document.body.appendChild(modalsDiv);
}

export function tearDownModalsContainer() {
  document.getElementById("modals")?.remove();
}

// -- bridge/family promise-cache warmup --

// `Body.tsx` calls `useAccountBridge` and `useLLDCoinFamily` (both React 19 `use()` on a
// Promise), which need the promise already settled since our test tree has no <Suspense>
// boundary. Warm both module-level promise caches once so the first render doesn't suspend.
// Precedent: tezos/__tests__/operationDetails.test.tsx.
export async function warmHederaBridgeCaches(account: Account) {
  await importLLDCoinFamily("hedera");
  await getAccountBridge(account);
}
