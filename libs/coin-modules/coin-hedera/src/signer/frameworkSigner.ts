import {
  deserializeTransaction,
  getHederaTransactionBodyBytes,
  serializeSignature,
} from "../logic/utils";
import type { HederaSigner } from "../types";

export type HederaFrameworkSigner = {
  getAddress(path: string): Promise<{ path: string; address: string; publicKey: string }>;
  signTransaction(path: string, unsignedTxHex: string): Promise<string>;
};

/** Adapts the device-level {@link HederaSigner} to the generic framework. */
export function createFrameworkSigner(signer: HederaSigner): HederaFrameworkSigner {
  return {
    async getAddress(path) {
      const publicKey = await signer.getPublicKey(path);
      // Hedera has no derivable address; the 0.0.x id comes from the discovery scan.
      return { path, address: publicKey, publicKey };
    },
    // The framework passes a path and an options object; the signer takes neither. The device app
    // accepts any 32-bit key index, but Ledger Live only ever stores index 0, so the signer pins it.
    async signTransaction(_path, unsignedTxHex) {
      const tx = deserializeTransaction(unsignedTxHex);
      const signature = await signer.signTransaction(getHederaTransactionBodyBytes(tx));
      return serializeSignature(signature);
    },
  };
}
