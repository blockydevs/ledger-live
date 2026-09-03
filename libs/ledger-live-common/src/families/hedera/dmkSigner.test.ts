import type { DeviceManagementKit } from "@ledgerhq/device-management-kit";
import type Transport from "@ledgerhq/hw-transport";
import { DmkSignerHedera } from "@ledgerhq/live-signer-hedera";
import { createDmkSigner } from "./dmkSigner";

jest.mock("@ledgerhq/live-signer-hedera");

const MockedDmkSignerHedera = DmkSignerHedera as jest.MockedClass<typeof DmkSignerHedera>;

const dmk = {} as DeviceManagementKit;
const mockTransport = { dmk, sessionId: "sessionId" } as unknown as Transport;

describe("createDmkSigner (Hedera)", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("builds the DMK signer from the transport dmk and session id", () => {
    createDmkSigner(mockTransport);

    expect(MockedDmkSignerHedera).toHaveBeenCalledTimes(1);
    expect(MockedDmkSignerHedera).toHaveBeenCalledWith(dmk, "sessionId");
  });

  it("throws when the transport carries no dmk", () => {
    expect(() => createDmkSigner({} as Transport)).toThrow("hedera: transport.dmk is missing");
  });

  it("throws when the transport carries no sessionId", () => {
    expect(() => createDmkSigner({ dmk } as unknown as Transport)).toThrow(
      "hedera: transport.sessionId is missing",
    );
  });
});
