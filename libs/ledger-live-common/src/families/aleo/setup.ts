// Goal of this file is to inject all necessary device/signer dependency to coin-modules
import { createBridges } from "@ledgerhq/coin-aleo/bridge/index";
import makeCliTools from "@ledgerhq/coin-aleo/test/cli";
import aleoResolver from "@ledgerhq/coin-aleo/signer/index";
// import Aleo from "@ledgerhq/hw-app-aleo";
// import type { TransactionStatus, Transaction } from "@ledgerhq/coin-aleo/types/index";
import type { Bridge } from "@ledgerhq/types-live";
// import { CryptoCurrency } from "@ledgerhq/types-cryptoassets";
import { EvmSigner, Transaction as EvmTransaction } from "@ledgerhq/coin-aleo/types/index";
import Transport from "@ledgerhq/hw-transport";
import { CreateSigner, createResolver, executeWithSigner } from "../../bridge/setup";
import { Resolver } from "../../hw/getAddress/types";
// import { getCurrencyConfiguration } from "../../config";
// import { EvmConfigInfo } from "@ledgerhq/coin-evm/lib/config";
import { LegacySignerEth } from "@ledgerhq/live-signer-evm";

// const createSigner: CreateSigner<Aleo> = (transport: Transport) => {
//   return new Aleo(transport);
// };

const createSigner: CreateSigner<EvmSigner> = (transport: Transport) => {
  return new LegacySignerEth(transport);
};

// const bridge: Bridge<Transaction, Account, TransactionStatus> = createBridges(
//   executeWithSigner(createSigner),
// );

// const getCurrencyConfig = (currency: CryptoCurrency) => {
//   return { info: getCurrencyConfiguration<EvmConfigInfo>(currency) };
// };

const bridge: Bridge<EvmTransaction> = createBridges(
  executeWithSigner(createSigner),
  // getCurrencyConfig,
  // getCryptoAssetsStore,
);

const resolver: Resolver = createResolver(createSigner, aleoResolver);

const cliTools = makeCliTools();

export { bridge, cliTools, resolver };
