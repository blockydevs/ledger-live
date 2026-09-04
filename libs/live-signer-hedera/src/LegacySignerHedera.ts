import type { HederaSigner } from "@ledgerhq/coin-hedera/types/signer";
import Hedera from "@ledgerhq/hw-app-hedera";
import Transport from "@ledgerhq/hw-transport";

export class LegacySignerHedera implements HederaSigner {
  private readonly signer: Hedera;

  constructor(transport: Transport) {
    this.signer = new Hedera(transport);
  }

  /**
   * Passes the caller's derivation path through to the device, unlike
   * {@link DmkSignerHedera}, which pins key index 0.
   */
  async getPublicKey(path: string): Promise<string> {
    return this.signer.getPublicKey(path);
  }

  /**
   * The device app supports only key index 0 for signing transactions,
   * regardless of the path used for {@link getPublicKey}.
   */
  async signTransaction(transaction: Uint8Array): Promise<Uint8Array> {
    return this.signer.signTransaction(transaction);
  }
}
