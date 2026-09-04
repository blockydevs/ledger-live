import { AccountId, Hbar, Mnemonic, TransactionId, TransferTransaction } from "@hashgraph/sdk";
import { getHederaTransactionBodyBytes } from "@ledgerhq/coin-hedera/logic/utils";
import { HEDERA_APDU_MAX_BODY_SIZE } from "@ledgerhq/coin-hedera/constants";
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

  /**
   * Presses RIGHT until the Speculos screen shows `text`, tracking screen
   * changes off `transport.automationEvents` instead of a fixed sleep.
   */
  async function pressUntilTextFound(text: string, maxAttempts = 18): Promise<void> {
    let currentText = "";
    const subscription = transport.automationEvents.subscribe(event => {
      currentText = typeof event.text === "string" ? event.text.trim() : currentText;
    });

    try {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (currentText === text) return;
        await transport.button(SpeculosButton.RIGHT);
        await delay(200);
      }
      throw new Error(
        `"${text}" not found on the Speculos screen after ${maxAttempts} attempts. Last screen text: "${currentText}"`,
      );
    } finally {
      subscription.unsubscribe();
    }
  }

  it("returns the public key the Speculos seed derives at index 0", async () => {
    const mnemonic = await Mnemonic.fromString(SEED as string);
    const expected = (await mnemonic.toStandardEd25519PrivateKey("", 0)).publicKey;

    const publicKey = await signer.getPublicKey(
      // maps to the same pinned index as any other path; "44/3030/7/0/0" would derive a
      // different key if the signer used it instead of ignoring it
      "44/3030/7/0/0",
    );

    expect(publicKey).toMatch(/^[0-9a-f]{64}$/);
    expect(publicKey).toBe(expected.toStringRaw());
  });

  /**
   * Frozen locally with an explicit transaction id and node account id, so the
   * tests need no network and stay deterministic.
   */
  function craftTransferBody(): Uint8Array {
    const sender = AccountId.fromString("0.0.1001");
    const recipient = AccountId.fromString("0.0.1002");

    const tx = new TransferTransaction()
      .setTransactionId(TransactionId.generate(sender))
      .setNodeAccountIds([AccountId.fromString("0.0.3")])
      .addHbarTransfer(sender, Hbar.fromTinybars(-100))
      .addHbarTransfer(recipient, Hbar.fromTinybars(100))
      .freeze();

    return getHederaTransactionBodyBytes(tx);
  }

  it("produces a signature that verifies against the device public key", async () => {
    const bodyBytes = craftTransferBody();
    expect(bodyBytes.length).toBeLessThanOrEqual(HEDERA_APDU_MAX_BODY_SIZE);

    const signPromise = signer.signTransaction(bodyBytes);

    await pressUntilTextFound("Confirm");
    await transport.button(SpeculosButton.BOTH);

    const signature = await signPromise;

    expect(signature).toHaveLength(64);

    const mnemonic = await Mnemonic.fromString(SEED as string);
    const publicKey = (await mnemonic.toStandardEd25519PrivateKey("", 0)).publicKey;

    expect(publicKey.verify(bodyBytes, signature)).toBe(true);
  });

  it("rejects with UserRefusedOnDevice when the transfer is denied on the device", async () => {
    const signPromise = signer.signTransaction(craftTransferBody());
    // The name, not the constructor: the app maps errors to titles by name, and this
    // config resolves the framework errors module to a different instance than `src`.
    const assertion = expect(signPromise).rejects.toMatchObject({
      name: "UserRefusedOnDevice",
    });

    await pressUntilTextFound("Reject");
    await transport.button(SpeculosButton.BOTH);

    await assertion;
  });
});
