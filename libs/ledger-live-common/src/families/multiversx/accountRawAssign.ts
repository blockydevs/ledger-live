import {
  assignFromAccountRaw,
  assignToAccountRaw,
  fromOperationExtraRaw,
  toOperationExtraRaw,
} from "@ledgerhq/coin-multiversx/serialization";

/**
 * Persists `multiversxResources` (nonce, delegations, guardian flag) and the staking amount on
 * `Operation.extra` through the raw account cycle, which the generic pipeline does not serialize. The
 * same helpers serve the legacy bridge, so turning the generic path off reads what it wrote.
 */
export default {
  assignFromAccountRaw,
  assignToAccountRaw,
  fromOperationExtraRaw,
  toOperationExtraRaw,
};
