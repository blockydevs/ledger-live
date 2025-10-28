import {
  getSerializedAddressParameters,
  updateTransaction,
  makeAccountBridgeReceive,
  makeScanAccounts,
} from "@ledgerhq/coin-framework/bridge/jsHelpers";
import { SignerContext } from "@ledgerhq/coin-framework/signer";
import type {
  AccountBridge,
  Bridge,
  CurrencyBridge,
  SignOperationEvent,
} from "@ledgerhq/types-live";
import getAddressWrapper from "@ledgerhq/coin-framework/bridge/getAddressWrapper";
// import type { CryptoAssetsStoreGetter } from "@ledgerhq/types-live";
import type { Observable } from "rxjs";
import type { Transaction as AleoTransaction } from "../types/index";
// import aleoCoinConfig, { type AleoConfig } from "../config";
import type { AleoSigner } from "../types/signer";
import resolver from "../hw-getAddress";
// import { setCryptoAssetsStoreGetter } from "../cryptoAssetsStore";
import { estimateMaxSpendable } from "./estimateMaxSpendable";
import { getAccountShape, sync } from "./synchronization";
// import { AleoConfig } from "../config";
// import { getAccountShape, postSync, sync } from "./synchronization";
// import { prepareTransaction } from "./prepareTransaction";
// import { createTransaction } from "./createTransaction";
// import { buildSignOperation } from "./signOperation";
// import { hydrate, preload } from "./preload";
// import nftResolvers from "./nftResolvers";
// import { broadcast } from "./broadcast";

export function buildCurrencyBridge(signerContext: SignerContext<AleoSigner>): CurrencyBridge {
  const getAddress = resolver(signerContext);

  const scanAccounts = makeScanAccounts({
    getAccountShape,
    getAddressFn: getAddress,
    // postSync,
  });

  return {
    preload: () => Promise.resolve({}),
    hydrate: () => {},
    scanAccounts,
    // nftResolvers,
    // getPreloadStrategy: () => ({
    //   preloadMaxAge: 24 * 60 * 60 * 1000, // 1 day cache
    // }),
  };
}

export function buildAccountBridge(
  signerContext: SignerContext<AleoSigner>,
): AccountBridge<AleoTransaction> {
  const getAddress = resolver(signerContext);

  const receive = makeAccountBridgeReceive(getAddressWrapper(getAddress));
  // const signOperation = buildSignOperation(signerContext);

  const signOperation = () => {
    throw new Error("not implemented");
  };

  return {
    // createTransaction,
    // updateTransaction: updateTransaction<EvmTransaction>,
    // prepareTransaction,
    // getTransactionStatus,
    createTransaction: () => {
      throw new Error("not implemented");
    },
    updateTransaction: updateTransaction<AleoTransaction>,
    prepareTransaction: () => {
      throw new Error("not implemented");
    },
    getTransactionStatus: () => {
      throw new Error("not implemented");
    },
    sync,
    receive,
    signOperation,
    signRawOperation: (): Observable<SignOperationEvent> => {
      throw new Error("signRawOperation is not supported");
    },
    broadcast: () => {
      throw new Error("not implemented");
    },
    estimateMaxSpendable,
    getSerializedAddressParameters,
  };
}

export function createBridges(
  signerContext: SignerContext<AleoSigner>,
  // coinConfig: AleoConfig,
  // cryptoAssetsStoreGetter: CryptoAssetsStoreGetter,
): Bridge<AleoTransaction> {
  // setCoinConfig(coinConfig);
  // aleoCoinConfig.setCoinConfig(() => ({ ...coinConfig, status: { type: "active" } }));
  // setCryptoAssetsStoreGetter(cryptoAssetsStoreGetter);

  console.log("createBridges called for Aleo");

  return {
    currencyBridge: buildCurrencyBridge(signerContext),
    accountBridge: buildAccountBridge(signerContext),
  };
}

// import {
//   getSerializedAddressParameters,
//   updateTransaction,
//   makeAccountBridgeReceive,
//   makeScanAccounts,
// } from "@ledgerhq/coin-framework/bridge/jsHelpers";
// import { SignerContext } from "@ledgerhq/coin-framework/signer";
// import type {
//   AccountBridge,
//   Bridge,
//   CurrencyBridge,
//   SignOperationEvent,
// } from "@ledgerhq/types-live";
// import getAddressWrapper from "@ledgerhq/coin-framework/bridge/getAddressWrapper";
// import type { CryptoAssetsStoreGetter } from "@ledgerhq/types-live";
// import type { Observable } from "rxjs";
// import type { AleoSigner, Transaction as EvmTransaction } from "../types/index";
// import { Result } from "@ledgerhq/coin-framework/lib-es/derivation";
// // import coinConfig, { type AleoConfig } from "../config";

// export function buildCurrencyBridge(_signerContext: SignerContext<AleoSigner>): CurrencyBridge {
//   const getAddress = async (): Promise<Result> => {
//     return {
//       address: "aleo1zcwqycj02lccfuu57dzjhva7w5dpzc7pngl0sxjhp58t6vlnnqxs6lnp6f",
//       path: "",
//       publicKey: "",
//     };
//   };

//   console.log("CURRENCY BRIDGE");

//   const scanAccounts = makeScanAccounts({
//     getAccountShape: () => {
//       throw new Error("not implemented");
//     },
//     getAddressFn: getAddress,
//     postSync: () => {
//       throw new Error("not implemented");
//     },
//   });

//   return {
//     preload: () => {
//       throw new Error("not implemented");
//     },
//     hydrate: () => {
//       throw new Error("not implemented");
//     },
//     scanAccounts,
//     getPreloadStrategy: () => ({
//       preloadMaxAge: 24 * 60 * 60 * 1000, // 1 day cache
//     }),
//   };
// }

// export function buildAccountBridge(
//   _signerContext: SignerContext<AleoSigner>,
// ): AccountBridge<EvmTransaction> {
//   const getAddress = () => {
//     throw new Error("not implemented");
//   };

//   const receive = makeAccountBridgeReceive(getAddressWrapper(getAddress));
//   const signOperation = () => {
//     throw new Error("not implemented");
//   };

//   return {
//     createTransaction: () => {
//       throw new Error("not implemented");
//     },
//     updateTransaction: updateTransaction<EvmTransaction>,
//     prepareTransaction: () => {
//       throw new Error("not implemented");
//     },
//     getTransactionStatus: () => {
//       throw new Error("not implemented");
//     },
//     sync: () => {
//       throw new Error("sync not implemented");
//     },
//     receive,
//     signOperation,
//     signRawOperation: (): Observable<SignOperationEvent> => {
//       throw new Error("signRawOperation is not supported");
//     },
//     broadcast: () => {
//       throw new Error("not implemented");
//     },
//     estimateMaxSpendable: () => {
//       throw new Error("not implemented");
//     },
//     getSerializedAddressParameters,
//   };
// }

// export function createBridges(
//   signerContext: SignerContext<AleoSigner>,
//   coinConfig: any, // Default value
//   _cryptoAssetsStoreGetter: CryptoAssetsStoreGetter = () => {
//     throw new Error("not implemented");
//   }, // Default value
// ): Bridge<EvmTransaction> {
//   // setCoinConfig(coinConfig);
//   // setCryptoAssetsStoreGetter(cryptoAssetsStoreGetter);

//   return {
//     currencyBridge: buildCurrencyBridge(signerContext),
//     accountBridge: buildAccountBridge(signerContext),
//   };
// }
