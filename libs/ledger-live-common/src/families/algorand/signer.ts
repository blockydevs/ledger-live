import algorandResolver from "@ledgerhq/coin-algorand/hw-getAddress";
import Algorand from "@ledgerhq/hw-app-algorand";
import type Transport from "@ledgerhq/hw-transport";
import { UserRefusedOnDevice } from "@ledgerhq/ledger-wallet-framework/errors";
import type { CoinFrameworkSigner } from "../../bridge/generic-coin-framework/types";
import { executeWithSigner, type CreateSigner } from "../../bridge/setup";

const SW_CANCEL = 0x6986;

type AlgorandFrameworkSigner = {
  getAddress: (
    path: string,
    options?: boolean | { verify?: boolean; derivationMode?: string },
  ) => Promise<{ address: string; publicKey: string }>;
  sign: Algorand["sign"];
  signTransaction: (path: string, transaction: string) => Promise<string>;
};

export const createSigner: CreateSigner<AlgorandFrameworkSigner> = (transport: Transport) => {
  const algorand = new Algorand(transport);
  return {
    getAddress: (path, options) => {
      const verify = typeof options === "boolean" ? options : options?.verify;
      return algorand.getAddress(path, !!verify);
    },
    sign: (path, message) => algorand.sign(path, message),
    // hw-app-algorand accepts the cancel status word, so a refusal arrives as a 2-byte signature.
    // The signature keeps its trailing status word: `combine` cuts it to 64 bytes.
    signTransaction: async (path, transaction) => {
      const result = await algorand.sign(path, transaction);
      const signature = result.signature;
      const isRefusedOnDevice =
        !signature || signature.readUInt16BE(signature.length - 2) === SW_CANCEL;
      if (isRefusedOnDevice) throw new UserRefusedOnDevice();

      return signature.toString("hex");
    },
  };
};

const context = executeWithSigner(createSigner);

export default {
  context,
  getAddress: algorandResolver(context),
} satisfies CoinFrameworkSigner;
