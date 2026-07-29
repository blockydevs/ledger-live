import type {
  AleoAddress,
  AleoAppConfig,
  AleoFeeIntentSignature,
  AleoRootIntentSignature,
  AleoSigner,
  AleoTvk,
  AleoViewKey,
} from "@ledgerhq/coin-aleo/types";
import { decodeRequestTlv } from "./tlv/decodeRequest";
import { encodeSignatureTlv } from "./tlv/encodeSignature";
import { loadAleoWasm } from "./wasm";

const NOT_IMPLEMENTED = "aleo coin-tester: not implemented for public transfers";

/**
 * Stands in for the device app.
 *
 * The device signs the TLV it is handed, not fields read out of an HTTP
 * response, so this does the same: decode the backend's TLV, sign, re-encode.
 * The signature therefore covers what the bridge actually built.
 */
export function buildMockAleoSigner(privateKey: string): AleoSigner {
  async function signIntent(intent: Buffer): Promise<string> {
    const decoded = await decodeRequestTlv(intent.toString("hex"));
    const wasm = await loadAleoWasm();

    const request = wasm.ExecutionRequest.sign(
      wasm.PrivateKey.from_string(privateKey),
      decoded.programId,
      decoded.functionName,
      decoded.inputs,
      decoded.inputTypes,
      // root_tvk and program_checksum only matter for nested or dynamic calls.
      undefined,
      undefined,
      decoded.isRoot,
      false,
    );

    return encodeSignatureTlv({
      signature: request.signature().toBytesLe(),
      tvk: request.tvk().toBytesLe(),
      tpk: request.to_tpk().toBytesLe(),
      // transfer_public has no record inputs, so there are no gammas.
      gammas: [],
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

    // The signer holds the private key, so it could derive these — the throw is
    // about scope, not capability: nothing verifies them yet.
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
