import { fromOperationExtraRaw, toOperationExtraRaw } from "@ledgerhq/coin-algorand/serialization";

/** Revives the `rewards` BigNumber of the operations the legacy bridge stored. */
export default {
  fromOperationExtraRaw,
  toOperationExtraRaw,
};
