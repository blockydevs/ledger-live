import { DeviceActionStatus, type DeviceManagementKit } from "@ledgerhq/device-management-kit";
import { SignerHederaBuilder } from "@ledgerhq/device-signer-kit-hedera";
import {
  LockedDeviceError,
  UserRefusedAddress,
  UserRefusedOnDevice,
} from "@ledgerhq/hw-transport/errors";
import { of } from "rxjs";
import { HederaInvalidSignerInputError } from "../src/errors";
import { DmkSignerHedera, HEDERA_INDEX_0_PATH } from "../src/DmkSignerHedera";

jest.mock("@ledgerhq/device-signer-kit-hedera", () => ({
  SignerHederaBuilder: jest.fn(),
}));

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

    it("maps 6985 to UserRefusedOnDevice", async () => {
      mockSignerHedera.signTransaction.mockReturnValue({
        observable: of({
          status: DeviceActionStatus.Error,
          error: { _tag: "HederaAppCommandError", errorCode: "6985" },
        }),
      });

      await expect(signer.signTransaction(body)).rejects.toThrow(UserRefusedOnDevice);
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
  });
});
