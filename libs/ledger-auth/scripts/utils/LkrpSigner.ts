import { type KeyObject, createPrivateKey, sign } from "node:crypto";
import type { Signer } from "./LkrpIdentityProvider";

export class LkrpSigner implements Signer {
  sign(privateKey: string, message: string): string {
    const sig = this.normalize(this.signP1363(privateKey, message));
    return this.p1363ToDer(sig).toString("hex");
  }

  private signP1363(privateKey: string, message: string): Buffer {
    const data = Buffer.from(message, "hex");
    return sign("sha256", data, {
      key: this.toKeyObject(privateKey),
      dsaEncoding: "ieee-p1363",
    });
  }

  private normalize(sig: Buffer): Buffer {
    // secp256k1 subgroup order (n), used to normalize ECDSA signatures to low-S form.
    // See https://github.com/bitcoin/bips/blob/master/bip-0146.mediawiki#low_s:
    // CO: curve order
    //       = 0xFFFFFFFF FFFFFFFF FFFFFFFF FFFFFFFE BAAEDCE6 AF48A03B BFD25E8C D0364141
    const CO = 0xffffffff_ffffffff_ffffffff_fffffffe_baaedce6_af48a03b_bfd25e8c_d0364141n;
    // HCO: half curve order
    //        = CO / 2 = 0x7FFFFFFF FFFFFFFF FFFFFFFF FFFFFFFF 5D576E73 57A4501D DFE92F46 681B20A0
    const HCO = CO / 2n;

    const normalizedSig = Buffer.from(sig);
    const s = normalizedSig.subarray(32, 64);
    const sVal = BigInt("0x" + s.toString("hex"));

    if (sVal > HCO) {
      const newS = (CO - sVal).toString(16).padStart(64, "0");
      Buffer.from(newS, "hex").copy(normalizedSig, 32);
    }

    return normalizedSig;
  }

  private p1363ToDer(sig: Buffer): Buffer {
    let r = sig.subarray(0, 32);
    let s = sig.subarray(32, 64);

    while (r.length > 1 && r[0] === 0x00) r = r.subarray(1);
    while (s.length > 1 && s[0] === 0x00) s = s.subarray(1);

    if (r[0] & 0x80) r = Buffer.concat([Buffer.from([0x00]), r]);
    if (s[0] & 0x80) s = Buffer.concat([Buffer.from([0x00]), s]);

    return Buffer.concat([
      Buffer.from([0x30, 2 + r.length + 2 + s.length]),
      Buffer.from([0x02, r.length]),
      r,
      Buffer.from([0x02, s.length]),
      s,
    ]);
  }

  private toKeyObject(priv: string): KeyObject {
    const version = Buffer.from([0x02, 0x01, 0x01]); // INTEGER version = 1
    const privateKey = Buffer.concat([Buffer.from([0x04, 0x20]), Buffer.from(priv, "hex")]); // OCTET STRING privateKey
    const oid = Buffer.from([0xa0, 0x07, 0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x0a]); // OID 1.3.132.0.10 (secp256k1) see: https://oid-base.com/get/1.3.132.0.10
    const der = Buffer.concat([
      Buffer.from([0x30, version.length + privateKey.length + oid.length]),
      version,
      privateKey,
      oid,
    ]);
    return createPrivateKey({ key: der, format: "der", type: "sec1" });
  }
}
