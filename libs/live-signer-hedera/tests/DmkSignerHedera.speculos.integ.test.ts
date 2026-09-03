import { Mnemonic } from "@hashgraph/sdk";
import { DeviceModelId } from "@ledgerhq/device-management-kit";
import { DeviceManagementKitTransportSpeculos } from "@ledgerhq/live-dmk-speculos";
import { DmkSignerHedera } from "../src/DmkSignerHedera";

const SEED = process.env.SEED;

describe("DmkSignerHedera against Speculos", () => {
  let transport: Awaited<ReturnType<typeof DeviceManagementKitTransportSpeculos.open>>;
  let signer: DmkSignerHedera;

  beforeAll(async () => {
    if (!SEED) throw new Error("SEED is not set");

    transport = await DeviceManagementKitTransportSpeculos.open({ model: DeviceModelId.NANO_X });
    signer = new DmkSignerHedera(transport.dmk, transport.sessionId);
  });

  afterAll(async () => {
    await transport?.close();
  });

  it("returns the public key the Speculos seed derives at index 0", async () => {
    const mnemonic = await Mnemonic.fromString(SEED as string);
    const expected = (await mnemonic.toStandardEd25519PrivateKey("", 0)).publicKey;

    const publicKey = await signer.getPublicKey(
      // ignored by the signer; passed to prove it is ignored
      "44/3030/0/0/0",
    );

    expect(publicKey).toMatch(/^[0-9a-f]{64}$/);
    expect(publicKey).toBe(expected.toStringRaw());
  });
});
