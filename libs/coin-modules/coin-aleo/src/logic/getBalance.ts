import type { Balance } from "@ledgerhq/coin-framework/api/types";
import { CryptoCurrency } from "@ledgerhq/types-cryptoassets";

/**
 * Get all assets linked to the user (native, tokens, ...)
 * @param currency - The currency we must get the balances of
 * @param address - The user's address
 * @returns Promise<Balance[]> - Array of balances for all assets (first element will always be the native asset)
 */
export async function getBalance(_currency: CryptoCurrency, _address: string): Promise<Balance[]> {
  const balance: Balance[] = [{ asset: { type: "native" }, value: BigInt(1) }];

  return balance;
}
