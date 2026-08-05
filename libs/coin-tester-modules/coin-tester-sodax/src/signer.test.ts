import { createHash } from "crypto";
import resolver from "@ledgerhq/coin-icon/hw-getAddress";
import type { SignerContext } from "@ledgerhq/ledger-wallet-framework/signer";
import type { IconSigner } from "@ledgerhq/coin-icon/signer";
import * as secp256k1 from "secp256k1";
import { icon } from "./fixtures";
import { buildIconSigner } from "./signer";

// No devnet involved: a broken signature here would otherwise only surface as
// an opaque broadcast rejection minutes into a docker run.
describe("buildIconSigner", () => {
  const privateKey = "2b8ac1e5d3f60729c4a1b0e8d7f2a3641c9e0b5d8a7f6e3c2d1b0a9f8e7d6c5b";
  const path = "44'/74'/0'/0/0";

  test("getAddress round-trips through coin-icon's resolver", async () => {
    const signer = buildIconSigner(privateKey);
    const context: SignerContext<IconSigner> = (_deviceId, fn) => fn(signer);

    const direct = await signer.getAddress(path);
    const resolved = await resolver(context)("deviceId", {
      path,
      currency: icon,
      derivationMode: "",
    });

    expect(resolved.address).toBe(direct.address);
    expect(resolved.address).toMatch(/^hx[0-9a-f]{40}$/);
  });

  test("signTransaction produces a signature that recovers the signer's public key", async () => {
    const signer = buildIconSigner(privateKey);
    const { publicKey } = await signer.getAddress(path);

    const rawTxAscii = JSON.stringify({ from: "hxsender", to: "hxrecipient", value: "0x1" });
    const { signedRawTxBase64, hashHex } = await signer.signTransaction(path, rawTxAscii);

    expect(hashHex).toBe(createHash("sha3-256").update(rawTxAscii).digest("hex"));

    const signatureBytes = Buffer.from(signedRawTxBase64, "base64");
    const rs = signatureBytes.subarray(0, 64);
    const recoveryId = signatureBytes[64];
    const hashBytes = Buffer.from(hashHex, "hex");

    // wallet.getPublicKey() (called through getAddress) returns the
    // uncompressed key without its leading 0x04 byte; ecdsaRecover with
    // compressed=false returns the same key with that byte present.
    const recoveredPublicKey = secp256k1.ecdsaRecover(rs, recoveryId, hashBytes, false);
    expect(Buffer.from(recoveredPublicKey).subarray(1).toString("hex")).toBe(publicKey);
    expect(secp256k1.ecdsaVerify(rs, hashBytes, recoveredPublicKey)).toBe(true);
  });

  test("signTransaction rejects a tampered payload", async () => {
    const signer = buildIconSigner(privateKey);
    const { publicKey } = await signer.getAddress(path);
    const uncompressedPublicKey = Buffer.concat([
      Buffer.from([0x04]),
      Buffer.from(publicKey, "hex"),
    ]);

    const rawTxAscii = JSON.stringify({ from: "hxsender", to: "hxrecipient", value: "0x1" });
    const { signedRawTxBase64 } = await signer.signTransaction(path, rawTxAscii);

    const signatureBytes = Buffer.from(signedRawTxBase64, "base64");
    const rs = signatureBytes.subarray(0, 64);
    const tamperedHash = createHash("sha3-256")
      .update(JSON.stringify({ from: "hxsender", to: "hxrecipient", value: "0x2" }))
      .digest();

    expect(secp256k1.ecdsaVerify(rs, tamperedHash, uncompressedPublicKey)).toBe(false);
  });
});
