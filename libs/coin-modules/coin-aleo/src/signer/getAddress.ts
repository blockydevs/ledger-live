import { GetAddressOptions } from "@ledgerhq/coin-framework/derivation";
import { GetAddressFn } from "@ledgerhq/coin-framework/bridge/getAddressWrapper";
import { SignerContext } from "@ledgerhq/coin-framework/signer";
import { AleoSigner } from "../types";

// TODO:
const getAddress = (signerContext: SignerContext<AleoSigner>): GetAddressFn => {
  return async (deviceId: string, { path }: GetAddressOptions) => {
    const publicKey = await signerContext(deviceId, signer => signer.getPublicKey(path));
    // const address = await signerContext(deviceId, signer => signer.getAddress(path));
    // Log the public key for debugging purposes
    // console.log(address.toString(), publicKey.toString(), path);
    return {
      path,
      publicKey: publicKey.toString(),
      address: publicKey.toString(),
      // publicKey: publicKey.toString(),
    };
  };
};

export default getAddress;
