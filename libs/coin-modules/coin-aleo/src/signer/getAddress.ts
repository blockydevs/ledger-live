import { GetAddressOptions } from "@ledgerhq/coin-framework/derivation";
import { GetAddressFn } from "@ledgerhq/coin-framework/bridge/getAddressWrapper";
import { SignerContext } from "@ledgerhq/coin-framework/signer";
import { AleoSigner } from "../types";

// TODO:
const getAddress = (_signerContext: SignerContext<AleoSigner>): GetAddressFn => {
  return async (_deviceId: string, _options: GetAddressOptions) => {
    throw new Error("TODO: not implemented");
  };
};

export default getAddress;
