import type {
  AleoAddress,
  AleoAppConfig,
  AleoFeeIntentSignature,
  AleoRootIntentSignature,
  AleoSigner,
  AleoTvk,
  AleoViewKey,
} from "@ledgerhq/coin-aleo/types";
import { decodeRequestTlv, type ResolveRecord } from "./tlv/decodeRequest";
import { encodeSignatureTlv } from "./tlv/encodeSignature";
import { isRecordInputId } from "./recordInputId";
import { loadAleoWasm } from "./wasm";

const NOT_IMPLEMENTED = "aleo coin-tester: not implemented for public transfers";

/**
 * Stands in for the device app: decodes the backend's TLV, signs it, and
 * re-encodes, so the signature covers what the bridge actually built.
 *
 * `resolveRecord` looks up the plaintext behind a record input's commitment;
 * omit it for public transfers, which have no record inputs (`gammas: []`).
 */
export function buildMockAleoSigner(privateKey: string, resolveRecord?: ResolveRecord): AleoSigner {
  async function signIntent(intent: Buffer): Promise<string> {
    const decoded = await decodeRequestTlv(intent.toString("hex"), { resolveRecord });
    const wasm = await loadAleoWasm();

    const request = wasm.ExecutionRequest.sign(
      wasm.PrivateKey.from_string(privateKey),
      decoded.programId,
      decoded.functionName,
      decoded.inputs,
      decoded.inputTypes,
      // root_tvk only matters for nested calls.
      undefined,
      decoded.programChecksum != null ? wasm.Field.fromString(decoded.programChecksum) : undefined,
      decoded.isRoot,
      decoded.programChecksum !== null,
    );

    // Read gammas off the signed request rather than computing them: this
    // wasm's Group has no scalar multiplication and PrivateKey exposes no sk_sig.
    const gammas = request
      .input_ids()
      .filter(isRecordInputId)
      .map(([, gamma]) => gamma.toBytesLe());

    return encodeSignatureTlv({
      signature: request.signature().toBytesLe(),
      tvk: request.tvk().toBytesLe(),
      tpk: request.to_tpk().toBytesLe(),
      gammas,
    });
  }

  return {
    getAppConfig: async (): Promise<AleoAppConfig> => ({ version: "0.0.0" }),

    getAddress: async (): Promise<AleoAddress> => {
      const wasm = await loadAleoWasm();
      return { address: wasm.PrivateKey.from_string(privateKey).to_address().to_string() };
    },

    getViewKey: async (): Promise<AleoViewKey> => {
      const wasm = await loadAleoWasm();
      return { viewKey: wasm.PrivateKey.from_string(privateKey).to_view_key().to_string() };
    },

    // Unimplemented because nothing exercises them yet, not for lack of the key.
    getTvk: (): Promise<AleoTvk> => Promise.reject(new Error(`${NOT_IMPLEMENTED}: getTvk`)),
    signNestedCall: (): Promise<never> =>
      Promise.reject(new Error(`${NOT_IMPLEMENTED}: signNestedCall`)),

    signRootIntent: async (
      _path: string,
      rootIntent: Buffer,
    ): Promise<AleoRootIntentSignature> => ({
      signature: await signIntent(rootIntent),
    }),

    signFeeIntent: async (feeIntent: Buffer): Promise<AleoFeeIntentSignature> => ({
      signature: await signIntent(feeIntent),
    }),
  };
}
