import { createBridges } from "@ledgerhq/coin-icon/bridge/index";
import resolver from "@ledgerhq/coin-icon/hw-getAddress";
import type { IconSigner } from "@ledgerhq/coin-icon/signer";
import type { IconAccount, Transaction } from "@ledgerhq/coin-icon/types/index";
import type { GetAddressFn } from "@ledgerhq/ledger-wallet-framework/bridge/getAddressWrapper";
import type { AccountBridge, CurrencyBridge } from "@ledgerhq/types-live";
import IconService from "icon-sdk-js";
import type TransactionResult from "icon-sdk-js/build/data/Formatter/TransactionResult";
import { coinConfigFactory, GOLOOP_RPC } from "./fixtures";

const { HttpProvider } = IconService;

export const rpc = new IconService(new HttpProvider(GOLOOP_RPC));

// icon-sdk-js rejects with plain strings.
function asError(err: unknown): Error {
  return typeof err === "string" ? new Error(err) : (err as Error);
}

/**
 * Builds the bridges the way `libs/ledger-live-common/src/families/icon/setup.ts`
 * does, with a software signer instead of a hardware transport.
 */
export function getBridges(signer: IconSigner): {
  currencyBridge: CurrencyBridge;
  accountBridge: AccountBridge<Transaction, IconAccount>;
  getAddress: GetAddressFn;
} {
  const context: Parameters<typeof resolver>[0] = (_deviceId, fn) => fn(signer);
  const { currencyBridge, accountBridge } = createBridges(context, coinConfigFactory);

  return {
    currencyBridge,
    // createBridges declares AccountBridge<Transaction> (base Account); every
    // account it actually handles carries iconResources.
    accountBridge: accountBridge as unknown as AccountBridge<Transaction, IconAccount>,
    getAddress: resolver(context),
  };
}

export async function waitForTransaction(
  hash: string,
  timeoutMs = 60_000,
): Promise<TransactionResult> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      return await rpc.getTransactionResult(hash).execute();
    } catch (err) {
      lastError = err;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  throw asError(lastError);
}
