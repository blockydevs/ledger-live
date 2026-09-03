import type { DeviceManagementKit } from "@ledgerhq/device-management-kit";
import {
  SignerHederaBuilder,
  type SignerHedera,
} from "@ledgerhq/device-signer-kit-hedera";
import { UserRefusedAddress } from "@ledgerhq/hw-transport/errors";
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

export class DmkSignerHedera {
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
}
