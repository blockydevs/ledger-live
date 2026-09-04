import { DeviceActionStatus } from "@ledgerhq/device-management-kit";
import {
  LockedDeviceError,
  UserRefusedAddress,
  UserRefusedOnDevice,
} from "@ledgerhq/ledger-wallet-framework/errors";
import { HederaInvalidSignerInputError } from "../src/errors";
import {
  mapDeviceActionError,
  mapDeviceActionResult,
  type HederaDAError,
} from "../src/mapResult";

const asError = (error: unknown) => error as HederaDAError;

describe("mapDeviceActionError", () => {
  it("maps 6985 to the refusal class the caller passes", () => {
    const error = asError({ _tag: "HederaAppCommandError", errorCode: "6985" });

    expect(mapDeviceActionError(error, UserRefusedAddress)).toBeInstanceOf(UserRefusedAddress);
    expect(mapDeviceActionError(error, UserRefusedOnDevice)).toBeInstanceOf(
      UserRefusedOnDevice,
    );
  });

  it("maps 5515 to LockedDeviceError", () => {
    const error = asError({ _tag: "DeviceLockedError", errorCode: "5515" });

    expect(mapDeviceActionError(error, UserRefusedOnDevice)).toBeInstanceOf(
      LockedDeviceError,
    );
  });

  it.each(["empty_transaction", "transaction_too_large", "unsupported_derivation_path"])(
    "maps the input-validation code %s to HederaInvalidSignerInputError",
    code => {
      const error = asError({
        _tag: "HederaInvalidInputError",
        errorCode: code,
        originalError: new Error("bad input"),
      });

      const mapped = mapDeviceActionError(error, UserRefusedOnDevice);

      expect(mapped).toBeInstanceOf(HederaInvalidSignerInputError);
      expect(mapped.message).toBe("HederaInvalidInputError: bad input");
    },
  );

  it("keeps every other status word generic and carries the tag", () => {
    for (const code of ["6d00", "6980", "6e00", "b00a"]) {
      const mapped = mapDeviceActionError(
        asError({ _tag: "HederaAppCommandError", errorCode: code }),
        UserRefusedOnDevice,
      );

      expect(mapped.constructor).toBe(Error);
      expect(mapped.message).toBe("HederaAppCommandError");
    }
  });

  it("handles an error that carries no errorCode", () => {
    const mapped = mapDeviceActionError(
      asError({ _tag: "InvalidStatusWordError", originalError: new Error("short response") }),
      UserRefusedOnDevice,
    );

    expect(mapped.constructor).toBe(Error);
    expect(mapped.message).toBe("InvalidStatusWordError: short response");
  });

  it("preserves the message of an untagged Error", () => {
    const thrown = new RangeError("Offset is outside the bounds of the DataView");

    expect(mapDeviceActionError(asError(thrown), UserRefusedOnDevice)).toBe(thrown);
  });

  it("describes an untagged object rejection instead of yielding an empty message", () => {
    const mapped = mapDeviceActionError(
      asError({ reason: "split failed" }),
      UserRefusedOnDevice,
    );

    expect(mapped.message).toBe('Untagged device action error: {"reason":"split failed"}');
  });

  it.each([
    ["a string", "split failed", 'Untagged device action error: "split failed"'],
    ["null", null, "Untagged device action error: null"],
    ["undefined", undefined, "Untagged device action error: undefined"],
  ])(
    "describes %s rejection rather than throwing while inspecting it",
    (_label, rejection, expected) => {
      expect(mapDeviceActionError(asError(rejection), UserRefusedOnDevice).message).toBe(
        expected,
      );
    },
  );
});

describe("mapDeviceActionResult", () => {
  it("returns the output when the action completed", () => {
    const output = { publicKey: "aabb" };

    expect(
      mapDeviceActionResult(
        { status: DeviceActionStatus.Completed, output } as never,
        UserRefusedAddress,
      ),
    ).toBe(output);
  });

  it("throws the mapped error when the action errored", () => {
    expect(() =>
      mapDeviceActionResult(
        {
          status: DeviceActionStatus.Error,
          error: { _tag: "HederaAppCommandError", errorCode: "6985" },
        } as never,
        UserRefusedAddress,
      ),
    ).toThrow(UserRefusedAddress);
  });

  it.each([DeviceActionStatus.NotStarted, DeviceActionStatus.Pending])(
    "throws on the non-terminal status %s",
    status => {
      expect(() => mapDeviceActionResult({ status } as never, UserRefusedAddress)).toThrow(
        `Device action ended with status ${status}`,
      );
    },
  );

  it("throws a stop-specific message when the action is stopped", () => {
    expect(() =>
      mapDeviceActionResult({ status: DeviceActionStatus.Stopped } as never, UserRefusedAddress),
    ).toThrow("Device action was stopped before it completed");
  });
});
