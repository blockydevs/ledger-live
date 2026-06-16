import type {
  ZcashAppConfig,
  ZcashAddress,
  ZcashViewKey,
  ZcashTrustedInput,
  ZcashSigner,
  ZcashSignature,
  SignerTransactionLike,
  BitcoinCreateTransactionLike,
} from "./types";
import {
  DeviceActionStatus,
  type DeviceActionState,
  type DeviceManagementKit,
} from "@ledgerhq/device-management-kit";
import {
  GetAddressDAError,
  GetFullViewingKeyDAError,
  SignerZcash,
  SignerZcashBuilder,
  type LegacyCreateTransactionArg,
  type LegacyTransaction,
  type SignTransactionDAError,
  type SignTransactionDAOutput,
} from "@ledgerhq/device-signer-kit-zcash";

type ZcashGetAddressResult = {
  publicKey: Uint8Array;
  address: string;
  chainCode: Uint8Array;
};

type ZcashGetFullViewingKeyResult = {
  mode: "ufvk" | "orchardFvk";
  fullViewingKey: string | Uint8Array;
};

export class DmkSignerZcash implements ZcashSigner {
  private readonly signer: SignerZcash;

  constructor(dmk: DeviceManagementKit, sessionId: string) {
    this.signer = new SignerZcashBuilder({ dmk, sessionId }).build();
  }

  private mapError<E extends { _tag: string }>(error: E): Error {
    return new Error(error._tag);
  }

  private resolveDeviceAction<T, E extends { _tag: string }>(observable: {
    subscribe: (observer: {
      next: (state: DeviceActionState<T, E, unknown>) => void;
      error: (err: unknown) => void;
    }) => unknown;
  }): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      observable.subscribe({
        next: state => {
          if (state.status === DeviceActionStatus.Error) {
            reject(this.mapError(state.error));
          }
          if (state.status === DeviceActionStatus.Completed) {
            resolve(state.output);
          }
        },
        error: err => {
          reject(err);
        },
      });
    });
  }

  async getAppConfig(): Promise<ZcashAppConfig> {
    throw new Error("Not implemented");
  }

  async getAddress(path: string, display?: boolean): Promise<ZcashAddress> {
    const { observable } = this.signer.getAddress(path, {
      checkOnDevice: !!display,
      skipOpenApp: true,
    });

    const result = await this.resolveDeviceAction<ZcashGetAddressResult, GetAddressDAError>(
      observable,
    );

    return {
      publicKey: Buffer.from(result.publicKey).toString("hex"),
      address: result.address,
      chainCode: Buffer.from(result.chainCode).toString("hex"),
    };
  }

  private toZip32AccountPath(path: string): string {
    const normalizedPath = path.startsWith("m/") ? path.slice(2) : path;
    const segments = normalizedPath.split("/");

    if (segments.length < 3) {
      throw new Error(`Invalid Zcash derivation path: ${path}`);
    }

    const [purpose, coinType, account] = segments;
    const accountIndex = account.match(/^(\d+)'$/)?.[1];

    if (!accountIndex || coinType !== "133'" || (purpose !== "44'" && purpose !== "32'")) {
      throw new Error(`Invalid Zcash derivation path: ${path}`);
    }

    return `32'/133'/${accountIndex}'`;
  }

  async getFullViewingKey(path: string): Promise<ZcashViewKey> {
    const zip32Path = this.toZip32AccountPath(path);
    const { observable } = this.signer.getFullViewingKey(zip32Path, {
      mode: "ufvk",
      skipOpenApp: true,
    });

    const result = await this.resolveDeviceAction<
      ZcashGetFullViewingKeyResult,
      GetFullViewingKeyDAError
    >(observable);

    if (result.mode !== "ufvk" || typeof result.fullViewingKey !== "string") {
      throw new Error("Unexpected full viewing key response mode");
    }

    return {
      viewKey: result.fullViewingKey,
    };
  }

  async getTrustedInput(): Promise<ZcashTrustedInput> {
    throw new Error("Not implemented");
  }

  private toLegacyTransaction(tx: SignerTransactionLike): LegacyTransaction {
    return {
      version: tx.version,
      inputs: tx.inputs.map(input => ({
        prevout: input.prevout,
        script: input.script,
        sequence: input.sequence,
        ...(input.tree ? { tree: input.tree } : {}),
      })),
      ...(tx.outputs
        ? { outputs: tx.outputs.map(output => ({ amount: output.amount, script: output.script })) }
        : {}),
      ...(tx.locktime ? { locktime: tx.locktime } : {}),
      ...(tx.timestamp ? { timestamp: tx.timestamp } : {}),
      ...(tx.nVersionGroupId ? { nVersionGroupId: tx.nVersionGroupId } : {}),
      ...(tx.nExpiryHeight ? { nExpiryHeight: tx.nExpiryHeight } : {}),
      ...(tx.extraData ? { extraData: tx.extraData } : {}),
    };
  }

  /**
   * Sign a transparent Zcash transaction via the DMK signer.
   *
   * Maps the Bitcoin signer's `CreateTransaction` (produced by the coin module's
   * `wallet.signAccountTx`) onto the DMK `LegacyCreateTransactionArg`, runs the
   * `signTransaction` device action, and returns the fully serialized signed
   * transaction. The DMK output is `0x`-prefixed (`HexaString`); the prefix is
   * stripped so the result matches what the Bitcoin broadcast path expects.
   */
  async createPaymentTransaction(arg: BitcoinCreateTransactionLike): Promise<string> {
    const legacyArg: LegacyCreateTransactionArg = {
      inputs: arg.inputs.map(([tx, outputIndex, script, sequence, blockHeight]) => [
        this.toLegacyTransaction(tx),
        outputIndex,
        script,
        sequence,
        blockHeight,
      ]),
      associatedKeysets: arg.associatedKeysets,
      outputScriptHex: arg.outputScriptHex,
      additionals: arg.additionals,
      ...(arg.changePath ? { changePath: arg.changePath } : {}),
      ...(arg.lockTime !== undefined ? { lockTime: arg.lockTime } : {}),
      ...(arg.blockHeight !== undefined ? { blockHeight: arg.blockHeight } : {}),
      ...(arg.sigHashType !== undefined ? { sigHashType: arg.sigHashType } : {}),
      ...(arg.expiryHeight ? { expiryHeight: arg.expiryHeight } : {}),
    };

    const { observable } = this.signer.signTransaction(legacyArg, { skipOpenApp: true });
    const signedTx = await this.resolveDeviceAction<
      SignTransactionDAOutput,
      SignTransactionDAError
    >(observable);

    return signedTx.startsWith("0x") ? signedTx.slice(2) : signedTx;
  }

  async signMessage(_path: string, _messageHex: string): Promise<ZcashSignature> {
    throw new Error("Not implemented");
  }
}
