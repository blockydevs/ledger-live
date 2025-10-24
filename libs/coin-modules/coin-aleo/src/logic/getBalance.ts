import type { Balance } from "@ledgerhq/coin-framework/api/types";

export async function getBalance(_address: string): Promise<Balance[]> {
  throw new Error("TODO: not implemented");
}
