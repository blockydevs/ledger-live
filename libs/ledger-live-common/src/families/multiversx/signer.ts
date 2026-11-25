import MultiversX from "@ledgerhq/hw-app-multiversx";
import Transport from "@ledgerhq/hw-transport";
import type { GetAddressFn } from "@ledgerhq/ledger-wallet-framework/bridge/getAddressWrapper";
import type { CoinFrameworkSigner } from "../../bridge/generic-coin-framework/types";
import { executeWithSigner } from "../../bridge/setup";

/** The ESDT metadata `bridge/api.ts:getDeviceSignOptions` adds to `signTransaction`'s options. */
export type MultiversXDeviceSignOptions = {
  esdt?: {
    ticker: string;
    identifier: string;
    decimals: number;
    chainId: string;
    ledgerSignature?: string;
  };
};

/**
 * `signTransaction` runs the legacy `signOperation` sequence: `setAddress`, `provideESDTInfo` for an
 * ESDT, then the signature. `getAddress` maps the framework's options object to a boolean, or the
 * device would ask to confirm the address mid-signing.
 */
export const createSigner = (transport: Transport) => {
  const multiversx = new MultiversX(transport);

  return {
    getAddress: (
      path: string,
      options?: boolean | ({ verify?: boolean } & Record<string, unknown>),
    ) => multiversx.getAddress(path, typeof options === "boolean" ? options : !!options?.verify),
    signTransaction: async (
      path: string,
      unsignedTx: string,
      options?: MultiversXDeviceSignOptions,
    ): Promise<string> => {
      await multiversx.setAddress(path);
      const esdt = options?.esdt;
      if (esdt) {
        await multiversx.provideESDTInfo(
          esdt.ticker,
          esdt.identifier,
          esdt.decimals,
          esdt.chainId,
          esdt.ledgerSignature,
        );
      }
      return multiversx.signTransaction(path, unsignedTx);
    },
  };
};

const context = executeWithSigner(createSigner);

const getAddress: GetAddressFn = (deviceId, { path, verify }) =>
  context(deviceId, signer =>
    signer
      .getAddress(path, verify || false)
      .then(({ address, publicKey }) => ({ address, publicKey, path })),
  );

export default {
  context,
  getAddress,
} satisfies CoinFrameworkSigner;
