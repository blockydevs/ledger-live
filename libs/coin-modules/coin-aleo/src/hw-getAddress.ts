// import eip55 from "eip55";
import { SignerContext } from "@ledgerhq/coin-framework/signer";
import { GetAddressOptions } from "@ledgerhq/coin-framework/derivation";
import { GetAddressFn } from "@ledgerhq/coin-framework/bridge/getAddressWrapper";
import { EvmSigner } from "./types/signer";

const resolver = (signerContext: SignerContext<Pick<EvmSigner, "getAddress">>): GetAddressFn => {
  return async (deviceId: string, { path, verify, currency }: GetAddressOptions) => {
    const { publicKey } = await signerContext(deviceId, signer => {
      // const { _address, publicKey } = await signerContext(deviceId, signer => {
      /* istanbul ignore next: optional chaining + undefined is a valid value */
      const chainId = currency?.ethereumLikeInfo?.chainId.toString();
      return signer.getAddress(path, verify, false, chainId);
    });

    return {
      address: "aleo1zcwqycj02lccfuu57dzjhva7w5dpzc7pngl0sxjhp58t6vlnnqxs6lnp6f",
      // address: eip55.encode(address),
      publicKey,
      path,
    };
  };
};

export default resolver;
