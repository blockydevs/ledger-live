import { useEffect, useReducer } from "react";
import type {
  Account,
  TransactionCommon,
  TransactionStatusCommon,
  Operation,
} from "@ledgerhq/types-live";
import type { LLDCoinFamily } from "./types";
import { getLoadedLLDCoinFamily, importLLDCoinFamily } from "./registry";

// Does not suspend: undefined while the family import is pending, and after it fails.
export function useLoadedLLDCoinFamily<
  A extends Account,
  T extends TransactionCommon,
  TS extends TransactionStatusCommon,
  O extends Operation,
>(name: string): LLDCoinFamily<A, T, TS, O> | undefined {
  const family = getLoadedLLDCoinFamily<A, T, TS, O>(name);
  const [, rerender] = useReducer((settledCount: number) => settledCount + 1, 0);

  useEffect(() => {
    if (family) return;

    importLLDCoinFamily(name).then(rerender, rerender);
  }, [family, name]);

  return family;
}
