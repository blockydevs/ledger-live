import Transport from "@ledgerhq/hw-transport";
import { createSigner } from "./signer";

const mockCalls: string[] = [];

jest.mock("@ledgerhq/hw-app-multiversx", () =>
  jest.fn().mockImplementation(() => ({
    getAddress: jest.fn(async (_path: string, display?: boolean) => {
      mockCalls.push(`getAddress:${display}`);
      return { address: "erd1address", publicKey: "pubkey" };
    }),
    setAddress: jest.fn(async (path: string) => {
      mockCalls.push(`setAddress:${path}`);
    }),
    provideESDTInfo: jest.fn(async (ticker: string) => {
      mockCalls.push(`provideESDTInfo:${ticker}`);
    }),
    signTransaction: jest.fn(async (path: string) => {
      mockCalls.push(`signTransaction:${path}`);
      return "signature-hex";
    }),
  })),
);

const PATH = "44'/508'/0'/0'/0'";
const esdt = {
  ticker: "USDC",
  identifier: "555344432d633736663166",
  decimals: 6,
  chainId: "1",
  ledgerSignature: "3045022100abcdef",
};

describe("multiversx signer", () => {
  beforeEach(() => {
    mockCalls.length = 0;
  });

  it("selects the address before signing a native transfer, without the token step", async () => {
    const signer = createSigner({} as Transport);

    await expect(signer.signTransaction(PATH, "{}", {})).resolves.toBe("signature-hex");
    expect(mockCalls).toEqual([`setAddress:${PATH}`, `signTransaction:${PATH}`]);
  });

  it("sends the ESDT metadata between selecting the address and signing", async () => {
    const signer = createSigner({} as Transport);

    await signer.signTransaction(PATH, "{}", { esdt });
    expect(mockCalls).toEqual([
      `setAddress:${PATH}`,
      "provideESDTInfo:USDC",
      `signTransaction:${PATH}`,
    ]);
  });

  it("selects the address again for every signature", async () => {
    const signer = createSigner({} as Transport);

    await signer.signTransaction(PATH, "{}", {});
    await signer.signTransaction(PATH, "{}", {});
    expect(mockCalls.filter(call => call.startsWith("setAddress"))).toHaveLength(2);
  });

  it("does not ask to display the address when the framework passes an options object", async () => {
    const signer = createSigner({} as Transport);

    await signer.getAddress(PATH, { derivationMode: "" });
    await signer.getAddress(PATH, { verify: true });
    await signer.getAddress(PATH, true);
    expect(mockCalls).toEqual(["getAddress:false", "getAddress:true", "getAddress:true"]);
  });
});
