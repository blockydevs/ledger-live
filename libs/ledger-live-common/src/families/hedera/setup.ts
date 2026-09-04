// Goal of this file is to inject all necessary device/signer dependency to coin-modules

import invariant from "invariant";
import { createBridges } from "@ledgerhq/coin-hedera/bridge/index";
import hederaResolver from "@ledgerhq/coin-hedera/signer/index";
import type {
  HederaCoinConfig,
  TransactionStatus,
  Transaction,
  HederaAccount,
  HederaSigner,
} from "@ledgerhq/coin-hedera/types/index";
import type { Bridge } from "@ledgerhq/types-live";
import { CreateSigner, createResolver, executeWithSigner } from "../../bridge/setup";
import { getCurrencyConfiguration } from "../../config";
import { Resolver } from "../../hw/getAddress/types";
import { createHederaSigner } from "./signerSelection";

const createSigner: CreateSigner<HederaSigner> = createHederaSigner;

const getCurrencyConfig = (currencyId?: string) => {
  invariant(currencyId, "hedera: currencyId is required in getCurrencyConfig");
  return getCurrencyConfiguration<HederaCoinConfig>(currencyId);
};

const bridge: Bridge<Transaction, HederaAccount, TransactionStatus> = createBridges(
  executeWithSigner(createSigner),
  getCurrencyConfig,
);

const resolver: Resolver = createResolver(createSigner, hederaResolver);

export { bridge, resolver };
