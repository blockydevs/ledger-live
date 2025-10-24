import type { Operation } from "@ledgerhq/coin-framework/api/types";

export async function listOperations(
  _address: string,
  _pagination: unknown,
): Promise<[Operation[], string]> {
  throw new Error("TODO: not implemented");
}
