import { createHash } from "crypto";
import type { IconAddress, IconSignature, IconSigner } from "@ledgerhq/coin-icon/signer";
import IconService from "icon-sdk-js";

const { IconWallet } = IconService;

/**
 * A software wallet holds one key, so `path` is unused on both methods.
 */
export function buildIconSigner(privateKey: string): IconSigner {
  const wallet = IconWallet.loadPrivateKey(privateKey);

  return {
    async getAddress(_path: string, _shouldDisplay?: boolean): Promise<IconAddress> {
      return {
        address: wallet.getAddress(),
        publicKey: wallet.getPublicKey(),
      };
    },
    async signTransaction(_path: string, rawTxAscii: string): Promise<IconSignature> {
      const hashHex = createHash("sha3-256").update(rawTxAscii).digest("hex");
      // Wallet#sign types its argument as a string, but the underlying
      // secp256k1 signer accepts and needs the raw hash bytes.
      const signedRawTxBase64 = wallet.sign(Buffer.from(hashHex, "hex") as unknown as string);
      return { signedRawTxBase64, hashHex };
    },
  };
}
