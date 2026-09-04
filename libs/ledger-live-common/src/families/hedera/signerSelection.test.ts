import type { DeviceManagementKit } from "@ledgerhq/device-management-kit";
import type Transport from "@ledgerhq/hw-transport";
import { DmkSignerHedera, LegacySignerHedera } from "@ledgerhq/live-signer-hedera";
import { createHederaSigner, setHederaLdmkEnabled } from "./signerSelection";

jest.mock("@ledgerhq/live-signer-hedera");

const MockedDmkSignerHedera = DmkSignerHedera as jest.MockedClass<typeof DmkSignerHedera>;
const MockedLegacySignerHedera = LegacySignerHedera as jest.MockedClass<typeof LegacySignerHedera>;

const dmk = {} as DeviceManagementKit;
const transportWithDmk = { dmk, sessionId: "sessionId" } as unknown as Transport;
const transportWithoutDmk = {} as Transport;

describe("createHederaSigner", () => {
  afterEach(() => {
    jest.clearAllMocks();
    setHederaLdmkEnabled(false);
  });

  it("builds the legacy signer when the flag is off and the transport carries a dmk", () => {
    setHederaLdmkEnabled(false);

    createHederaSigner(transportWithDmk);

    expect(MockedLegacySignerHedera).toHaveBeenCalledTimes(1);
    expect(MockedLegacySignerHedera).toHaveBeenCalledWith(transportWithDmk);
    expect(MockedDmkSignerHedera).not.toHaveBeenCalled();
  });

  it("builds the legacy signer when the flag is off and the transport carries no dmk", () => {
    setHederaLdmkEnabled(false);

    createHederaSigner(transportWithoutDmk);

    expect(MockedLegacySignerHedera).toHaveBeenCalledTimes(1);
    expect(MockedLegacySignerHedera).toHaveBeenCalledWith(transportWithoutDmk);
    expect(MockedDmkSignerHedera).not.toHaveBeenCalled();
  });

  it("builds the DMK signer when the flag is on and the transport carries a dmk and session id", () => {
    setHederaLdmkEnabled(true);

    createHederaSigner(transportWithDmk);

    expect(MockedDmkSignerHedera).toHaveBeenCalledTimes(1);
    expect(MockedDmkSignerHedera).toHaveBeenCalledWith(dmk, "sessionId");
    expect(MockedLegacySignerHedera).not.toHaveBeenCalled();
  });

  it("falls back to the legacy signer when the flag is on but the transport carries no dmk", () => {
    setHederaLdmkEnabled(true);

    createHederaSigner(transportWithoutDmk);

    expect(MockedLegacySignerHedera).toHaveBeenCalledTimes(1);
    expect(MockedLegacySignerHedera).toHaveBeenCalledWith(transportWithoutDmk);
    expect(MockedDmkSignerHedera).not.toHaveBeenCalled();
  });
});
