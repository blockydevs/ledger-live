import { DeviceActionStatus, type DeviceManagementKit } from "@ledgerhq/device-management-kit";
import { SignerHederaBuilder } from "@ledgerhq/device-signer-kit-hedera";
import { GetAddressCommand } from "@ledgerhq/device-signer-kit-hedera/internal/app-binder/command/GetAddressCommand.js";
import { SignTransactionCommand } from "@ledgerhq/device-signer-kit-hedera/internal/app-binder/command/SignTransactionCommand.js";
import { LockedDeviceError, UserRefusedAddress } from "@ledgerhq/ledger-wallet-framework/errors";
import { of, throwError } from "rxjs";
import { HederaInvalidSignerInputError, TransactionRefusedOnDevice } from "../src/errors";
import { DmkSignerHedera, HEDERA_INDEX_0_PATH } from "../src/DmkSignerHedera";

jest.mock("@ledgerhq/device-signer-kit-hedera", () => ({
  SignerHederaBuilder: jest.fn(),
}));

function hex(apdu: { getRawApdu(): Uint8Array }): string {
  return Buffer.from(apdu.getRawApdu()).toString("hex");
}

describe("DmkSignerHedera", () => {
  let signer: DmkSignerHedera;

  const mockSignerHedera = {
    getAddress: jest.fn(),
    signTransaction: jest.fn(),
  };

  const dmkMock = { executeDeviceAction: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(SignerHederaBuilder).mockImplementation(
      () => ({ build: () => mockSignerHedera }) as unknown as SignerHederaBuilder,
    );

    signer = new DmkSignerHedera(dmkMock as unknown as DeviceManagementKit, "sessionId");
  });

  it("builds the kit signer from the dmk and the session id", () => {
    expect(SignerHederaBuilder).toHaveBeenCalledWith({ dmk: dmkMock, sessionId: "sessionId" });
  });

  describe("getPublicKey", () => {
    it("pins the derivation path and returns the hex key", async () => {
      mockSignerHedera.getAddress.mockReturnValue({
        observable: of({
          status: DeviceActionStatus.Completed,
          output: { publicKey: "8b1c0f2d" },
        }),
      });

      const result = await signer.getPublicKey("44'/3030'/0'/0'/0'");

      expect(result).toBe("8b1c0f2d");
      expect(mockSignerHedera.getAddress).toHaveBeenCalledWith(HEDERA_INDEX_0_PATH, {
        checkOnDevice: false,
        skipOpenApp: true,
      });
    });

    it("ignores the path the caller passes", async () => {
      mockSignerHedera.getAddress.mockReturnValue({
        observable: of({
          status: DeviceActionStatus.Completed,
          output: { publicKey: "8b1c0f2d" },
        }),
      });

      await signer.getPublicKey("44/3030/7/0/0");

      expect(mockSignerHedera.getAddress).toHaveBeenCalledWith(HEDERA_INDEX_0_PATH, {
        checkOnDevice: false,
        skipOpenApp: true,
      });
    });

    it("maps 6985 to UserRefusedAddress", async () => {
      mockSignerHedera.getAddress.mockReturnValue({
        observable: of({
          status: DeviceActionStatus.Error,
          error: { _tag: "HederaAppCommandError", errorCode: "6985" },
        }),
      });

      await expect(signer.getPublicKey(HEDERA_INDEX_0_PATH)).rejects.toThrow(UserRefusedAddress);
    });

    it("maps 5515 to LockedDeviceError", async () => {
      mockSignerHedera.getAddress.mockReturnValue({
        observable: of({
          status: DeviceActionStatus.Error,
          error: { _tag: "DeviceLockedError", errorCode: "5515" },
        }),
      });

      await expect(signer.getPublicKey(HEDERA_INDEX_0_PATH)).rejects.toThrow(LockedDeviceError);
    });

    it("rejects when the observable emits a transport error", async () => {
      mockSignerHedera.getAddress.mockReturnValue({
        observable: throwError(() => new Error("transport error")),
      });

      await expect(signer.getPublicKey(HEDERA_INDEX_0_PATH)).rejects.toThrow("transport error");
    });

    it("rejects instead of hanging when the device action is stopped", async () => {
      mockSignerHedera.getAddress.mockReturnValue({
        observable: of({ status: DeviceActionStatus.Stopped }),
      });

      await expect(signer.getPublicKey(HEDERA_INDEX_0_PATH)).rejects.toThrow(
        "Device action was stopped before it completed",
      );
    });

    it("rejects with a generic error carrying the tag when errorCode is unknown", async () => {
      mockSignerHedera.getAddress.mockReturnValue({
        observable: of({
          status: DeviceActionStatus.Error,
          error: { _tag: "HederaAppCommandError", errorCode: "unknown_code" },
        }),
      });

      await expect(signer.getPublicKey(HEDERA_INDEX_0_PATH)).rejects.toThrow(
        "HederaAppCommandError",
      );
    });

    it("rejects with a generic error carrying the tag when the error carries no errorCode", async () => {
      mockSignerHedera.getAddress.mockReturnValue({
        observable: of({
          status: DeviceActionStatus.Error,
          error: { _tag: "HederaUnknownError" },
        }),
      });

      await expect(signer.getPublicKey(HEDERA_INDEX_0_PATH)).rejects.toThrow("HederaUnknownError");
    });
  });

  describe("signTransaction", () => {
    const body = new Uint8Array([0x0a, 0x0b, 0x0c]);
    const signature = new Uint8Array(64).fill(7);

    it("pins the derivation path, forwards the body, and returns the signature", async () => {
      mockSignerHedera.signTransaction.mockReturnValue({
        observable: of({ status: DeviceActionStatus.Completed, output: signature }),
      });

      const result = await signer.signTransaction(body);

      expect(result).toBe(signature);
      expect(mockSignerHedera.signTransaction).toHaveBeenCalledWith(HEDERA_INDEX_0_PATH, body, {
        skipOpenApp: true,
      });
    });

    it("maps 6985 to TransactionRefusedOnDevice", async () => {
      mockSignerHedera.signTransaction.mockReturnValue({
        observable: of({
          status: DeviceActionStatus.Error,
          error: { _tag: "HederaAppCommandError", errorCode: "6985" },
        }),
      });

      await expect(signer.signTransaction(body)).rejects.toThrow(TransactionRefusedOnDevice);
    });

    it.each(["empty_transaction", "transaction_too_large", "unsupported_derivation_path"])(
      "maps the input-validation code %s to HederaInvalidSignerInputError",
      async code => {
        mockSignerHedera.signTransaction.mockReturnValue({
          observable: of({
            status: DeviceActionStatus.Error,
            error: { _tag: "HederaInvalidInputError", errorCode: code },
          }),
        });

        await expect(signer.signTransaction(body)).rejects.toThrow(HederaInvalidSignerInputError);
      },
    );

    it("maps 5515 to LockedDeviceError", async () => {
      mockSignerHedera.signTransaction.mockReturnValue({
        observable: of({
          status: DeviceActionStatus.Error,
          error: { _tag: "DeviceLockedError", errorCode: "5515" },
        }),
      });

      await expect(signer.signTransaction(body)).rejects.toThrow(LockedDeviceError);
    });

    it("rejects when the observable emits a transport error", async () => {
      mockSignerHedera.signTransaction.mockReturnValue({
        observable: throwError(() => new Error("transport error")),
      });

      await expect(signer.signTransaction(body)).rejects.toThrow("transport error");
    });

    it("rejects instead of hanging when the device action is stopped", async () => {
      mockSignerHedera.signTransaction.mockReturnValue({
        observable: of({ status: DeviceActionStatus.Stopped }),
      });

      await expect(signer.signTransaction(body)).rejects.toThrow(
        "Device action was stopped before it completed",
      );
    });

    it("rejects with a generic error carrying the tag when errorCode is unknown", async () => {
      mockSignerHedera.signTransaction.mockReturnValue({
        observable: of({
          status: DeviceActionStatus.Error,
          error: { _tag: "HederaAppCommandError", errorCode: "unknown_code" },
        }),
      });

      await expect(signer.signTransaction(body)).rejects.toThrow("HederaAppCommandError");
    });

    it("rejects with a generic error carrying the tag when the error carries no errorCode", async () => {
      mockSignerHedera.signTransaction.mockReturnValue({
        observable: of({
          status: DeviceActionStatus.Error,
          error: { _tag: "HederaUnknownError" },
        }),
      });

      await expect(signer.signTransaction(body)).rejects.toThrow("HederaUnknownError");
    });
  });

  describe("wire bytes", () => {
    /**
     * `checkOnDevice: false` is `getPublicKey`'s call to the kit, so this pins
     * `P1_NON_CONFIRM` (0x01): the Hedera app shows the UI when p1 is 0 and answers
     * silently for any other value, the opposite of every other app on the device.
     */
    it("sends e0 02 01 00 04 00000000 for a public key read at index 0", () => {
      const command = new GetAddressCommand({
        derivationPath: HEDERA_INDEX_0_PATH,
        checkOnDevice: false,
      });

      expect(hex(command.getApdu())).toBe("e00201000400000000");
    });

    it("sends e0 04 00 00 with the four-byte little-endian index prefix when signing", () => {
      const command = new SignTransactionCommand({
        derivationPath: HEDERA_INDEX_0_PATH,
        transaction: new Uint8Array([0xaa, 0xbb, 0xcc]),
      });

      expect(hex(command.getApdu())).toBe("e00400000700000000aabbcc");
    });
  });
});
