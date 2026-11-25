import type Transport from "@ledgerhq/hw-transport";
import { createSigner } from "./signer";

// The real app client over a transport that accepts every command, so what reaches the device is
// what `hw-app-multiversx` itself sends or refuses.
const INS_SIGN_HASH_TX = 0x07;
const PATH = "44'/508'/0'/0'/0'";
const UNSIGNED_TX = JSON.stringify({ nonce: 1, value: "0", receiver: "erd1receiver" });

function fakeTransport() {
  const send = jest.fn(async (_cla: number, _ins: number) => Buffer.from([0x90, 0x00]));
  return { transport: { send, decorateAppAPIMethods: jest.fn() } as unknown as Transport, send };
}

describe("multiversx signer on the device app client", () => {
  it("refuses an ESDT transfer whose token has no CAL signature, before anything is signed", async () => {
    const { transport, send } = fakeTransport();

    await expect(
      createSigner(transport).signTransaction(PATH, UNSIGNED_TX, {
        esdt: { ticker: "USDC", identifier: "USDC-c76f1f", decimals: 6, chainId: "1" },
      }),
    ).rejects.toThrow("Invalid ESDT token credentials!");
    expect(send.mock.calls.map(([, ins]) => ins)).not.toContain(INS_SIGN_HASH_TX);
  });
});
