import {
  DeviceActionStatus,
  type DeviceActionState,
} from "@ledgerhq/device-management-kit";
import type {
  GetAddressDAError,
  SignTransactionDAError,
} from "@ledgerhq/device-signer-kit-hedera";
import { LockedDeviceError } from "@ledgerhq/hw-transport/errors";
import { HederaInvalidSignerInputError } from "./errors";

export type HederaDAError = GetAddressDAError | SignTransactionDAError;

/** A zero-argument Ledger Live error class, e.g. `UserRefusedAddress`. */
export type RefusalErrorClass = new () => Error;

function genericMessage(error: HederaDAError): string {
  const originalError = "originalError" in error ? error.originalError : null;
  const originalMessage = originalError instanceof Error ? originalError.message : null;
  const tag = error._tag;

  return originalMessage ? `${tag}: ${originalMessage}` : tag;
}

/**
 * The device answers 0x6985 for any refusal, so the caller decides whether that
 * means a refused address or a refused transaction.
 */
export function mapDeviceActionError(
  error: HederaDAError,
  RefusedError: RefusalErrorClass,
): Error {
  if (!("errorCode" in error)) {
    return new Error(genericMessage(error));
  }

  switch (String(error.errorCode)) {
    case "6985":
      return new RefusedError();
    case "5515":
      return new LockedDeviceError();
    case "empty_transaction":
    case "transaction_too_large":
    case "unsupported_derivation_path":
      return new HederaInvalidSignerInputError(genericMessage(error));
    default:
      return new Error(genericMessage(error));
  }
}

export function mapDeviceActionResult<T>(
  actionState: DeviceActionState<T, HederaDAError, unknown>,
  RefusedError: RefusalErrorClass,
): T {
  switch (actionState.status) {
    case DeviceActionStatus.Completed:
      return actionState.output;
    case DeviceActionStatus.Error:
      throw mapDeviceActionError(actionState.error, RefusedError);
    case DeviceActionStatus.NotStarted:
    case DeviceActionStatus.Pending:
    case DeviceActionStatus.Stopped:
    default:
      throw new Error("Unknown device action status");
  }
}
