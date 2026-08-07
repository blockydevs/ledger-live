import { PrivateKey } from "@hashgraph/sdk";
import type { HederaSigner } from "@ledgerhq/coin-hedera/types";

/**
 * One signer per account under test; an explicit key lets fixture code sign for the same account
 * with the raw SDK. `getPublicKey` must return the raw 32-byte Ed25519 hex, not DER — it becomes
 * `seedIdentifier`, which `combine()` feeds into `PublicKey.fromString`.
 */
export function buildHederaSigner(
  privateKey: PrivateKey = PrivateKey.generateED25519(),
): HederaSigner {
  return {
    async getPublicKey(_path: string): Promise<string> {
      const raw = privateKey.publicKey.toStringRaw();
      if (raw.length !== 64) {
        throw new Error(
          `hedera tester signer: expected a 64-char raw Ed25519 public key, got ${raw.length} chars — the SDK may have changed its default encoding to DER`,
        );
      }
      return raw;
    },
    async signTransaction(transaction: Uint8Array): Promise<Uint8Array> {
      return privateKey.sign(transaction);
    },
  };
}
