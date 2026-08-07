import { log } from "@ledgerhq/logs";
import type { AccountBridge } from "@ledgerhq/types-live";
import { makeSync } from "../jsHelpers";
import { genericGetAccountShape } from "./getAccountShape";
import {
  getSerializedAddressParameters,
  makeAccountBridgeReceive,
  updateTransaction,
} from "@ledgerhq/ledger-wallet-framework/bridge/jsHelpers";
import getAddressWrapper from "@ledgerhq/ledger-wallet-framework/bridge/getAddressWrapper";
import type { ReceiveAddressMatcher } from "@ledgerhq/ledger-wallet-framework/derivation";
import { getSigner } from "./signer";
import { getBridgeApi } from "./bridge";
import { genericPrepareTransaction } from "./prepareTransaction";
import { genericGetTransactionStatus } from "./getTransactionStatus";
import { genericEstimateMaxSpendable } from "./estimateMaxSpendable";
import { createTransaction } from "./createTransaction";
import { genericBroadcast } from "./broadcast";
import { genericSignOperation } from "./signOperation";
import { genericSignRawOperation } from "./signRawOperation";
import { postSync } from "./postSync";
import { genericValidateAddress } from "./validateAddress";
import { getAccountRawAssignHooks } from "./accountRawAssign";
import type { GenericTransaction, CoinFrameworkSigner } from "./types";

const defaultAddressMatcher: ReceiveAddressMatcher = (result, account) => ({
  matches: result.address === account.freshAddress,
  address: result.address,
});

/**
 * Resolves the family's `receiveAddressMatcher` hook per account, since a family's bridge api
 * can be a function of the currency. A family that declares no hook, and a family whose
 * `bridge/api` module fails to load, both fall back to the default comparison so that receive
 * keeps working.
 */
const bridgeApiAddressMatcher =
  (network: string): ReceiveAddressMatcher =>
  async (result, account) => {
    let matcher = defaultAddressMatcher;
    try {
      const bridgeApi = await getBridgeApi(account.currency, network);
      matcher = bridgeApi.receiveAddressMatcher ?? defaultAddressMatcher;
    } catch (e) {
      log("warn", `receive: falling back to the default address matcher for ${network}`, e);
    }
    return matcher(result, account);
  };

export async function getCoinFrameworkAccountBridge(
  network: string,
  kind: string,
  customSigner?: CoinFrameworkSigner,
): Promise<AccountBridge<GenericTransaction>> {
  const signer = customSigner ?? (await getSigner(network));
  const { assignFromAccountRaw, assignToAccountRaw } = await getAccountRawAssignHooks(network);
  return {
    sync: makeSync({ getAccountShape: genericGetAccountShape(network, kind), postSync }),
    receive: makeAccountBridgeReceive(getAddressWrapper(signer.getAddress), {
      receiveAddressMatcher: bridgeApiAddressMatcher(network),
    }),
    createTransaction: createTransaction,
    updateTransaction: updateTransaction<GenericTransaction>,
    prepareTransaction: genericPrepareTransaction(network, kind),
    getTransactionStatus: genericGetTransactionStatus(network, kind),
    estimateMaxSpendable: genericEstimateMaxSpendable(network, kind),
    broadcast: genericBroadcast(network, kind),
    signOperation: genericSignOperation(network, kind)(signer.context),
    signRawOperation: genericSignRawOperation(network, kind)(signer.context),
    assignFromAccountRaw,
    assignToAccountRaw,
    getSerializedAddressParameters, // NOTE: check whether it should be exposed by coin-module's api instead?
    validateAddress: genericValidateAddress(network, kind),
  } satisfies Partial<AccountBridge<GenericTransaction>>;
}
