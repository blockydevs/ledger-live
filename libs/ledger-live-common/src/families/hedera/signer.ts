import Transport from "@ledgerhq/hw-transport";
import Hedera from "@ledgerhq/hw-app-hedera";
import {
  deserializeTransaction,
  getHederaTransactionBodyBytes,
  serializeSignature,
} from "@ledgerhq/coin-hedera/logic/utils";
import type { GetAddressFn } from "@ledgerhq/ledger-wallet-framework/bridge/getAddressWrapper";
import type { GetAddressOptions } from "@ledgerhq/ledger-wallet-framework/derivation";
import type { SignerContext } from "@ledgerhq/ledger-wallet-framework/signer";
import { CreateSigner, executeWithSigner } from "../../bridge/setup";
import type { CoinFrameworkSigner } from "../../bridge/generic-coin-framework/types";

type HederaCoinSigner = {
  getAddress: (path: string) => Promise<{ path: string; address: string; publicKey: string }>;
  signTransaction: (path: string, rawTxHex: string) => Promise<string>;
};

const createSignerHedera: CreateSigner<HederaCoinSigner> = (transport: Transport) => {
  const hedera = new Hedera(transport);
  return {
    getAddress: async (path: string) => {
      const publicKey = await hedera.getPublicKey(path);
      // Hedera has no on-device address computation; the public key doubles as the address.
      return { path, address: publicKey, publicKey };
    },
    signTransaction: async (path: string, rawTxHex: string) => {
      const tx = deserializeTransaction(rawTxHex);
      const bodyBytes = getHederaTransactionBodyBytes(tx);
      const signature = await hedera.signTransaction(bodyBytes);
      return serializeSignature(signature);
    },
  };
};

const hederaGetAddress = (signerContext: SignerContext<HederaCoinSigner>): GetAddressFn => {
  return async (deviceId: string, { path }: GetAddressOptions) => {
    return signerContext(deviceId, signer => signer.getAddress(path));
  };
};

export const context = executeWithSigner(createSignerHedera);

export default {
  context,
  getAddress: hederaGetAddress(context),
} satisfies CoinFrameworkSigner;
