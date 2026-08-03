import { DEFAULT_STEP_LIMIT, MAINNET_NID, RPC_VERSION } from "@ledgerhq/coin-icon/constants";
import BigNumber from "bignumber.js";
import IconService from "icon-sdk-js";
import type TransactionResult from "icon-sdk-js/build/data/Formatter/TransactionResult";
import { GOLOOP_RPC } from "./fixtures";

const { HttpProvider, IconBuilder, IconConverter, IconWallet, SignedTransaction } = IconService;

export const rpc = new IconService(new HttpProvider(GOLOOP_RPC));

// icon-sdk-js rejects with plain strings.
function asError(err: unknown): Error {
  return typeof err === "string" ? new Error(err) : (err as Error);
}

export async function sendIcx({
  privateKey,
  to,
  valueLoop,
}: {
  privateKey: string;
  to: string;
  valueLoop: BigNumber;
}): Promise<string> {
  const wallet = IconWallet.loadPrivateKey(privateKey);
  const transaction = new IconBuilder.IcxTransactionBuilder()
    .from(wallet.getAddress())
    .to(to)
    .value(IconConverter.toHexNumber(valueLoop))
    .stepLimit(IconConverter.toHexNumber(DEFAULT_STEP_LIMIT))
    .nid(IconConverter.toHexNumber(MAINNET_NID))
    .nonce(IconConverter.toHexNumber(1))
    .version(IconConverter.toHexNumber(RPC_VERSION))
    // ICON timestamps are microseconds.
    .timestamp(IconConverter.toHexNumber(Date.now() * 1000))
    .build();

  try {
    return await rpc.sendTransaction(new SignedTransaction(transaction, wallet)).execute();
  } catch (err) {
    throw asError(err);
  }
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
