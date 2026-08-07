// Goal of this file is to inject all necessary device/signer dependency to coin-modules

// Removal trigger: `bridge` exists only so `genericCoinFrameworkFamilies.json` can route hedera
// back to the legacy bridge. Once hedera stays on the generic coin framework for good, delete
// `bridge` (and its `HederaBridge`/`getLegacyBridge` helpers) and keep only `resolver`.

import invariant from "invariant";
import Transport from "@ledgerhq/hw-transport";
import Hedera from "@ledgerhq/hw-app-hedera";
import type { HederaCoinConfig } from "@ledgerhq/coin-hedera/config";
import hederaResolver from "@ledgerhq/coin-hedera/signer/index";
import type { HederaAccount, TransactionStatus } from "@ledgerhq/coin-hedera/types/index";
import type { Bridge } from "@ledgerhq/types-live";
import { CreateSigner, createResolver, executeWithSigner } from "../../bridge/setup";
import { getCurrencyConfiguration } from "../../config";
import { Resolver } from "../../hw/getAddress/types";
import { createLegacyCompatBridges } from "./legacyBridgeCompat";
import type { Transaction } from "./types";

const createSigner: CreateSigner<Hedera> = (transport: Transport) => {
  return new Hedera(transport);
};

const getCurrencyConfig = (currencyId?: string) => {
  invariant(currencyId, "hedera: currencyId is required in getCurrencyConfig");
  return getCurrencyConfiguration<HederaCoinConfig>(currencyId);
};

type HederaBridge = Bridge<Transaction, HederaAccount, TransactionStatus>;

// Building the legacy bridge runs `setCoinConfig` as a side effect on the shared coin-config
// store. Resolving a device address only needs `resolver` below, so the legacy bridge must not
// be built until something actually reads `bridge`.
let legacyBridge: HederaBridge | undefined;

function getLegacyBridge(): HederaBridge {
  if (!legacyBridge) {
    legacyBridge = createLegacyCompatBridges(executeWithSigner(createSigner), getCurrencyConfig);
  }
  return legacyBridge;
}

const bridge: HederaBridge = {
  get currencyBridge() {
    return getLegacyBridge().currencyBridge;
  },
  get accountBridge() {
    return getLegacyBridge().accountBridge;
  },
};

const resolver: Resolver = createResolver(createSigner, hederaResolver);

export { bridge, resolver };
