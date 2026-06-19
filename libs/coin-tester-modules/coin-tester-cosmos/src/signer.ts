import { rawSecp256k1PubkeyToRawAddress } from "@cosmjs/amino";
import {
  Bip39,
  EnglishMnemonic,
  Secp256k1,
  Secp256k1Signature,
  sha256,
  Slip10,
  Slip10Curve,
  Slip10RawIndex,
  stringToPath,
} from "@cosmjs/crypto";
import { toBech32 } from "@cosmjs/encoding";
import {
  CosmosAddress,
  CosmosGetAddressAndPubKeyRes,
  CosmosSignature,
  CosmosSigner,
} from "@ledgerhq/coin-cosmos/types/signer";
import { DEV_MNEMONIC } from "./helpers";

const SW_OK = 0x9000;

type DerivedKey = { privKey: Uint8Array; compressedPubKey: Uint8Array };

// Cosmos convention: BIP44 purpose/coin_type/account are hardened (first 3
// segments); change and address_index are not. The bridge strips the `'`
// markers before calling the signer (signOperation.ts:57), so we re-apply
// the hardening here.
function applyCosmosHardening(path: number[]) {
  return path.map((n, i) =>
    i < 3 ? Slip10RawIndex.hardened(n) : Slip10RawIndex.normal(n),
  );
}

// BIP-39 seed derivation is PBKDF2 (expensive) and the mnemonic is fixed, so
// compute the seed once and reuse it across every derivation/sign.
let seedPromise: Promise<Uint8Array> | undefined;
function getSeed(): Promise<Uint8Array> {
  if (!seedPromise) {
    seedPromise = Bip39.mnemonicToSeed(new EnglishMnemonic(DEV_MNEMONIC));
  }
  return seedPromise;
}

async function deriveFromNumberPath(path: number[]): Promise<DerivedKey> {
  const seed = await getSeed();
  const { privkey } = Slip10.derivePath(
    Slip10Curve.Secp256k1,
    seed,
    applyCosmosHardening(path),
  );
  const { pubkey } = await Secp256k1.makeKeypair(privkey);
  return { privKey: privkey, compressedPubKey: Secp256k1.compressPubkey(pubkey) };
}

async function deriveFromStringPath(path: string): Promise<DerivedKey> {
  const seed = await getSeed();
  const { privkey } = Slip10.derivePath(
    Slip10Curve.Secp256k1,
    seed,
    stringToPath(path.startsWith("m/") ? path : `m/${path}`),
  );
  const { pubkey } = await Secp256k1.makeKeypair(privkey);
  return { privKey: privkey, compressedPubKey: Secp256k1.compressPubkey(pubkey) };
}

export async function buildSigner(): Promise<CosmosSigner> {
  return {
    async getAddressAndPubKey(
      path: number[],
      hrp: string,
    ): Promise<CosmosGetAddressAndPubKeyRes> {
      const { compressedPubKey } = await deriveFromNumberPath(path);
      const rawAddr = rawSecp256k1PubkeyToRawAddress(compressedPubKey);
      return {
        bech32_address: toBech32(hrp, rawAddr),
        // signOperation.ts reads this as raw bytes
        // (Buffer.from(compressed_pk).toString("base64")). The interface types it
        // as string; cast through unknown to the declared field type to keep the
        // runtime bytes while preserving the API surface (matches DmkSignerCosmos.ts:68).
        compressed_pk: Buffer.from(
          compressedPubKey,
        ) as unknown as CosmosGetAddressAndPubKeyRes["compressed_pk"],
        return_code: SW_OK,
        error_message: "",
      };
    },

    async sign(path: number[], buffer: Buffer): Promise<CosmosSignature> {
      const { privKey } = await deriveFromNumberPath(path);
      const ext = await Secp256k1.createSignature(sha256(buffer), privKey);
      // ExtendedSecp256k1Signature emits 65-byte r||s||v; strip recovery and
      // re-encode as DER — the bridge will fromDer() it (signOperation.ts:85).
      const rs = ext.toFixedLength().slice(0, 64);
      const der = Secp256k1Signature.fromFixedLength(rs).toDer();
      return { signature: Buffer.from(der), return_code: SW_OK };
    },

    async getAddress(path: string, hrp: string): Promise<CosmosAddress> {
      const { compressedPubKey } = await deriveFromStringPath(path);
      const rawAddr = rawSecp256k1PubkeyToRawAddress(compressedPubKey);
      return {
        publicKey: Buffer.from(compressedPubKey).toString("hex"),
        address: toBech32(hrp, rawAddr),
      };
    },
  };
}
