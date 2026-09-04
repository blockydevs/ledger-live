import { openTransportReplayer, RecordStore } from "@ledgerhq/hw-transport-mocker";
import { LegacySignerHedera } from "../src/LegacySignerHedera";

describe("LegacySignerHedera", () => {
  it("sends the exact getPublicKey APDU and returns the public key", async () => {
    const transport = await openTransportReplayer(
      RecordStore.fromString(`
        => e002010009000000002c00000bd6
        <= 0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f209000
      `),
    );
    const signer = new LegacySignerHedera(transport);

    const publicKey = await signer.getPublicKey("44/3030");

    expect(publicKey).toBe("0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20");
  });

  it("prefixes signTransaction with four zero bytes and strips the status bytes", async () => {
    const transport = await openTransportReplayer(
      RecordStore.fromString(`
        => e00400000700000000aabbcc
        <= aabbccdd9000
      `),
    );
    const signer = new LegacySignerHedera(transport);

    const signature = await signer.signTransaction(new Uint8Array([0xaa, 0xbb, 0xcc]));

    expect(Buffer.from(signature).toString("hex")).toBe("aabbccdd");
  });
});
