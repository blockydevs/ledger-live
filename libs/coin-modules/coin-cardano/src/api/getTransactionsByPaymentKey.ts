import { CryptoCurrency } from "@ledgerhq/types-cryptoassets";
import { APITransaction } from "./api-types";
import { getAllTransactionsByKeys } from "./fetchTransactions";

/**
 * Fetch every transaction that involves a single payment credential. Thin wrapper over the
 * shared {@link getAllTransactionsByKeys} pagination so balance derivation and account sync
 * share one termination rule (no drift). `blockHeight` 0 fetches the full history.
 */
export async function fetchAllTransactionsByPaymentKey(
  paymentKey: string,
  currency: CryptoCurrency,
): Promise<APITransaction[]> {
  const { transactions } = await getAllTransactionsByKeys([paymentKey], 0, currency);
  return transactions;
}
