import type { DeviceManagementKit } from "@ledgerhq/device-management-kit";
import type Transport from "@ledgerhq/hw-transport";
import type { GetAddressOptions } from "@ledgerhq/ledger-wallet-framework/derivation";
import { DmkSignerHedera } from "@ledgerhq/live-signer-hedera";
import { getSigner } from "../../bridge/generic-coin-framework/signer";
import { coinModuleLoaders } from "../../coin-modules/loaders";
import hederaSigner, { createSigner, hederaGetAddress } from "./signer";

jest.mock("@ledgerhq/live-signer-hedera");

const MockedDmkSignerHedera = DmkSignerHedera as jest.MockedClass<typeof DmkSignerHedera>;

const dmk = {} as DeviceManagementKit;
const mockTransport = { dmk, sessionId: "sessionId" } as unknown as Transport;

describe("createSigner (Hedera)", () => {
  let getPublicKey: jest.Mock;
  let signTransaction: jest.Mock;

  beforeEach(() => {
    getPublicKey = jest.fn().mockResolvedValue("aabbcc");
    signTransaction = jest.fn();
    MockedDmkSignerHedera.mockImplementation(
      () => ({ getPublicKey, signTransaction }) as unknown as DmkSignerHedera,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("getAddress resolves through the signer context", async () => {
    const signer = createSigner(mockTransport);
    const context = <U>(_deviceId: string, fn: (s: ReturnType<typeof createSigner>) => U) =>
      Promise.resolve(fn(signer));

    const result = await hederaGetAddress(context)("deviceId", {
      path: "44'/3030'/0'/0'/0'",
    } as GetAddressOptions);

    expect(getPublicKey).toHaveBeenCalledTimes(1);
    expect(getPublicKey).toHaveBeenCalledWith("44'/3030'/0'/0'/0'");
    expect(result).toEqual({
      path: "44'/3030'/0'/0'/0'",
      address: "aabbcc",
      publicKey: "aabbcc",
    });
  });
});

describe("hedera signer registration", () => {
  it("registers a loadSigner on the hedera coin-module loader", () => {
    const loader = coinModuleLoaders.find(l => l.family === "hedera");

    expect(loader?.loadSigner).toBeDefined();
  });

  it("resolves through getSigner so the generic coin framework can reach it", async () => {
    await expect(getSigner("hedera")).resolves.toBe(hederaSigner);
  });
});
