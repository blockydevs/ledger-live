import {
  DeviceActionStatus,
  type DeviceActionState,
} from "@ledgerhq/device-management-kit";
import type {
  GetAddressDAError,
  SignTransactionDAError,
} from "@ledgerhq/device-signer-kit-hedera";
import { LockedDeviceError } from "@ledgerhq/ledger-wallet-framework/errors";
import { HederaInvalidSignerInputError } from "./errors";

export type HederaDAError = GetAddressDAError | SignTransactionDAError;

/** A zero-argument Ledger Live error class, e.g. `UserRefusedAddress`. */
export type RefusalErrorClass = new () => Error;

type ErrorDetails = { errorCode?: unknown; _tag?: unknown; originalError?: unknown };

const INPUT_VALIDATION_CODES = new Set([
  "empty_transaction",
  "transaction_too_large",
  "unsupported_derivation_path",
]);

function safeDescribe(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function describeError(details: ErrorDetails, error: unknown): string {
  const originalMessage =
    details.originalError instanceof Error ? details.originalError.message : null;
  const tag =
    typeof details._tag === "string" && details._tag.length > 0
      ? details._tag
      : `Untagged device action error: ${safeDescribe(error)}`;

  return originalMessage ? `${tag}: ${originalMessage}` : tag;
}

/**
 * The device answers 0x6985 for any refusal, so the caller decides whether that
 * means a refused address or a refused transaction.
 */
export function mapDeviceActionError(error: unknown, RefusedError: RefusalErrorClass): Error {
  const details: ErrorDetails = typeof error === "object" && error !== null ? error : {};

  if (details.errorCode === "6985") {
    return new RefusedError();
  }
  if (details.errorCode === "5515") {
    return new LockedDeviceError();
  }
  if (typeof details.errorCode === "string" && INPUT_VALIDATION_CODES.has(details.errorCode)) {
    return new HederaInvalidSignerInputError(describeError(details, error));
  }
  if (typeof details._tag === "string" && details._tag.length > 0) {
    return new Error(describeError(details, error));
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error(`Untagged device action error: ${safeDescribe(error)}`);
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
    case DeviceActionStatus.Stopped:
      throw new Error("Device action was stopped before it completed");
    case DeviceActionStatus.NotStarted:
    case DeviceActionStatus.Pending:
    default:
      throw new Error(`Device action ended with status ${actionState.status}`);
  }
}
