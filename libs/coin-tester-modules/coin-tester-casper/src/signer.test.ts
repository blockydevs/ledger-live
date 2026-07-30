import { KeyAlgorithm, NativeTransferBuilder, PublicKey, Transaction } from "casper-js-sdk";
import { casperAddressFromPubKey } from "@ledgerhq/coin-casper/bridge/bridgeHelpers/addresses";
import { buildCasperSigner } from "./signer";

// Devnet user 0 at m/44'/506'/0'/0/100. `derive --secret-key` prints this block
// with CRLF line endings; LF is accepted the same way.
const SENDER_PEM = [
  "-----BEGIN EC PRIVATE KEY-----",
  "MC4CAQEEILbMXV+qfDw320v5oVZgI6qpodcW/njtGm+3mmkLlADooAcGBSuBBAAK",
  "-----END EC PRIVATE KEY-----",
].join("\n");

const SENDER_PATH = "44'/506'/0'/0/100";
const SENDER_PUBLIC_KEY = "0202f9bae6a6c5a8345c2aa8339b54ff3fcf82d2f6a9cce1732e765c2cc403b3be9f";
const RECIPIENT_PUBLIC_KEY = "0202420b3257568e81062aaf41f45fe30dd2f64f9683b08f5436437154d23dbf1bcf";

// version byte + u32 field count + 3 (u16 index, u32 offset) pairs + u32 blob length
const BLOB_START = 5 + 3 * 6 + 4;

const buildTransfer = (): Transaction =>
  new NativeTransferBuilder()
    .from(PublicKey.fromHex(SENDER_PUBLIC_KEY))
    .target(PublicKey.fromHex(RECIPIENT_PUBLIC_KEY))
    .amount("10000000000")
    .id(1)
    .chainName("casper")
    .payment(100000000)
    .build();

describe("buildCasperSigner", () => {
  const signer = buildCasperSigner({ [SENDER_PATH]: SENDER_PEM });

  it("returns the bare compressed key, leaving the address to the module's resolver", async () => {
    const { publicKey, Address } = await signer.getAddressAndPubKey(SENDER_PATH);

    expect(publicKey).toHaveLength(33);
    expect(Address).toHaveLength(0);
    expect(casperAddressFromPubKey(publicKey, KeyAlgorithm.SECP256K1)).toBe(SENDER_PUBLIC_KEY);
  });

  it("returns the same key from showAddressAndPubKey", async () => {
    const shown = await signer.showAddressAndPubKey(SENDER_PATH);
    const fetched = await signer.getAddressAndPubKey(SENDER_PATH);

    expect(shown.publicKey.toString("hex")).toBe(fetched.publicKey.toString("hex"));
  });

  it("signs the hash embedded in the serialized transaction", async () => {
    const tx = buildTransfer();

    const { signatureRS } = await signer.sign(SENDER_PATH, Buffer.from(tx.toBytes()));

    expect(signatureRS).toHaveLength(64);
    tx.setSignature(
      Buffer.concat([Buffer.from([KeyAlgorithm.SECP256K1]), signatureRS]),
      PublicKey.fromHex(SENDER_PUBLIC_KEY),
    );
    expect(tx.validate()).toBe(true);
  });

  it("rejects bytes whose embedded hash does not match the payload", async () => {
    const bytes = Buffer.from(buildTransfer().toBytes());
    expect(bytes.readUInt32LE(1)).toBe(3); // BLOB_START assumes a 3-field calltable
    bytes[BLOB_START] ^= 0xff; // first byte of field 0, the embedded hash

    await expect(signer.sign(SENDER_PATH, bytes)).rejects.toThrow(/embedded hash/);
  });

  it("fails loudly for an unknown derivation path", async () => {
    await expect(signer.sign("44'/506'/0'/0/999", Buffer.alloc(0))).rejects.toThrow(
      /no key for path/,
    );
  });
});
