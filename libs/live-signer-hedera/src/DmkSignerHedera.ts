import type { DeviceManagementKit } from "@ledgerhq/device-management-kit";
import {
  SignerHederaBuilder,
  type SignerHedera,
} from "@ledgerhq/device-signer-kit-hedera";
import { UserRefusedAddress, UserRefusedOnDevice } from "@ledgerhq/hw-transport/errors";
import type { HederaSigner } from "@ledgerhq/coin-hedera/types/signer";
import { lastValueFrom } from "rxjs";
import { mapDeviceActionResult } from "./mapResult";

/**
 * The device app takes a 4-byte little-endian key index, not a BIP32 path, and
 * Ledger Live only ever stores index 0: `hederaBip44.overridesDerivation` is the
 * literal `"44/3030"`, which carries no `<account>` placeholder, so every account
 * index resolves to the same path. The kit maps this two-element shape to index 0.
 *
 * Passing a caller-supplied path instead would change the wire bytes for stored
 * accounts, which changes the `seedIdentifier` and hides the funds.
 */
export const HEDERA_INDEX_0_PATH = "44'/3030'";

export class DmkSignerHedera implements HederaSigner {
  private readonly signer: SignerHedera;

  constructor(dmk: DeviceManagementKit, sessionId: string) {
    this.signer = new SignerHederaBuilder({ dmk, sessionId }).build();
  }

  /**
   * The path is ignored on purpose — see {@link HEDERA_INDEX_0_PATH}. The device
   * returns a raw public key; Hedera has no derivable address, and the `0.0.x`
   * account id comes from the discovery scan.
   */
  async getPublicKey(_path: string): Promise<string> {
    const { observable } = this.signer.getAddress(HEDERA_INDEX_0_PATH, {
      checkOnDevice: false,
      skipOpenApp: true,
    });

    const result = mapDeviceActionResult(await lastValueFrom(observable), UserRefusedAddress);

    return result.publicKey;
  }

  /**
   * Takes the transaction body bytes, not a serialized transaction. `coin-hedera`
   * owns the protobuf work: `deserializeTransaction`,
   * `getHederaTransactionBodyBytes` and `serializeSignature`.
   *
   * The kit rejects a body over 251 bytes (`APDU_MAX_PAYLOAD - KEY_INDEX_LENGTH`).
   * The device app runs no APDU chaining, so that limit is the device's.
   */
  async signTransaction(transaction: Uint8Array): Promise<Uint8Array> {
    const { observable } = this.signer.signTransaction(HEDERA_INDEX_0_PATH, transaction, {
      skipOpenApp: true,
    });

    return mapDeviceActionResult(await lastValueFrom(observable), UserRefusedOnDevice);
  }
}
