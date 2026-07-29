import React from "react";
import BigNumber from "bignumber.js";
import { DeviceModelId } from "@ledgerhq/types-devices";
import type { Device } from "@ledgerhq/live-common/hw/actions/types";
import type { Account, Operation, SignedOperation } from "@ledgerhq/types-live";
import { getAccountBridge } from "@ledgerhq/live-common/bridge/index";
import { importLLDCoinFamily } from "~/renderer/families";
import { HEDERA_ACCOUNT_1 } from "./account.mock";

// Shared scaffolding for the hedera modal integration tests. Lives in __mocks__ so it can be
// `require()`d from a hoisted jest.mock() factory, which cannot close over out-of-scope variables.

export const mockDevice: Device = {
  deviceId: "test-device-id",
  modelId: DeviceModelId.nanoSP,
  wired: false,
};

export const deviceActionRequestSpy = jest.fn();

export const signedOperation: Operation = {
  ...HEDERA_ACCOUNT_1.operations[0],
  id: "signed-op-1",
  accountId: HEDERA_ACCOUNT_1.id,
};

export const deviceActionModuleMock = {
  __esModule: true,
  default: ({
    onResult,
    request,
  }: {
    onResult?: (
      result:
        | { signedOperation: { operation: Operation; signature: string }; device: Device }
        | { transactionSignError: Error },
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
              signedOperation: { operation: signedOperation, signature: "signature" },
              device: mockDevice,
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

// gRPC broadcast can't be intercepted by MSW; stub it so no real mainnet write fires.
export const broadcastModuleMock = {
  useBroadcast: () => (signed: SignedOperation) => Promise.resolve(signed.operation),
};

export function setUpModalsContainer() {
  const modalsDiv = document.createElement("div");
  modalsDiv.id = "modals";
  document.body.appendChild(modalsDiv);
}

export function tearDownModalsContainer() {
  document.getElementById("modals")?.remove();
}

type BridgeTransactionMockState = {
  transaction?: unknown;
  account?: unknown;
  parentAccount?: unknown;
};

type CreateBridgeTransactionMockOptions = {
  // Read lazily each render so a reassigned `mockStatusErrors` is reflected without re-registering.
  getStatusErrors?: () => Record<string, Error>;
  // Let StepAccount's `setAccount` flow back into state (ReceiveWithAssociationModal only).
  withAccountUpdates?: boolean;
};

export function createBridgeTransactionMock(options: CreateBridgeTransactionMockOptions = {}) {
  const { getStatusErrors = () => ({}), withAccountUpdates = false } = options;

  return {
    __esModule: true,
    default: (_bridge: unknown, optionalInit?: () => BridgeTransactionMockState) => {
      const [state, setState] = React.useState<BridgeTransactionMockState>(() =>
        optionalInit ? optionalInit() : {},
      );

      const updateTransaction = React.useCallback(
        (updater: (tx: unknown) => unknown) =>
          setState(prev => ({
            ...prev,
            transaction: updater(prev.transaction),
          })),
        [],
      );
      const setTransaction = React.useCallback(
        (transaction: unknown) =>
          setState(prev => ({
            ...prev,
            transaction,
          })),
        [],
      );
      const setAccount = React.useCallback(
        (account: unknown, parentAccount: unknown) =>
          withAccountUpdates ? setState(prev => ({ ...prev, account, parentAccount })) : undefined,
        [withAccountUpdates],
      );

      return {
        transaction: state.transaction,
        setTransaction,
        updateTransaction,
        account: state.account,
        parentAccount: state.parentAccount,
        setAccount,
        updateAccount: () => {},
        status: {
          errors: getStatusErrors(),
          warnings: {},
          estimatedFees: new BigNumber(0),
          amount: new BigNumber(0),
          totalSpent: new BigNumber(0),
        },
        bridgeError: null,
        bridgePending: false,
      };
    },
  };
}

// Settle the bridge/coin-family promise caches so the first render doesn't suspend (no <Suspense> here).
export async function warmBridgeCaches(account: Account) {
  await importLLDCoinFamily("hedera");
  await getAccountBridge(account);
}
