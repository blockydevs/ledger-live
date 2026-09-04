import { AccountId, Hbar, Mnemonic, TransactionId, TransferTransaction } from "@hashgraph/sdk";
import { getHederaTransactionBodyBytes } from "@ledgerhq/coin-hedera/logic/utils";
import { DeviceModelId } from "@ledgerhq/device-management-kit";
import { DeviceManagementKitTransportSpeculos } from "@ledgerhq/live-dmk-speculos";
import { SpeculosButton } from "@ledgerhq/live-dmk-speculos/transport/DeviceManagementKitTransportSpeculos";
import { DmkSignerHedera } from "../src/DmkSignerHedera";

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

const SEED = process.env.SEED;

describe("DmkSignerHedera against Speculos", () => {
  let transport: Awaited<ReturnType<typeof DeviceManagementKitTransportSpeculos.open>>;
  let signer: DmkSignerHedera;

  beforeAll(async () => {
    if (!SEED) throw new Error("SEED is not set");

    transport = await DeviceManagementKitTransportSpeculos.open({
      model: DeviceModelId.NANO_X,
      apiPort: process.env.SPECULOS_API_PORT ?? "5000",
    });
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

  it("produces a signature that verifies against the device public key", async () => {
    const sender = AccountId.fromString("0.0.1001");
    const recipient = AccountId.fromString("0.0.1002");

    // Frozen locally with an explicit transaction id and node account id, so the
    // test needs no network and stays deterministic.
    const tx = new TransferTransaction()
      .setTransactionId(TransactionId.generate(sender))
      .setNodeAccountIds([AccountId.fromString("0.0.3")])
      .addHbarTransfer(sender, Hbar.fromTinybars(-100))
      .addHbarTransfer(recipient, Hbar.fromTinybars(100))
      .freeze();

    const bodyBytes = getHederaTransactionBodyBytes(tx);
    expect(bodyBytes.length).toBeLessThanOrEqual(251);

    const signPromise = signer.signTransaction(bodyBytes);

    await delay(500);
    const APPROVAL_BUTTON_SEQUENCE = [
      SpeculosButton.RIGHT,
      SpeculosButton.RIGHT,
      SpeculosButton.RIGHT,
      SpeculosButton.BOTH,
    ];
    for (const button of APPROVAL_BUTTON_SEQUENCE) {
      await transport.button(button);
    }

    const signature = await signPromise;

    expect(signature).toHaveLength(64);

    const mnemonic = await Mnemonic.fromString(SEED as string);
    const publicKey = (await mnemonic.toStandardEd25519PrivateKey("", 0)).publicKey;

    expect(publicKey.verify(bodyBytes, signature)).toBe(true);
  });
});
