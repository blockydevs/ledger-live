import type { SupportedFeatures } from "@ledgerhq/coin-module-framework/features/types";

export const supportedFeatures: SupportedFeatures = {
  // ESDT transfers are supported too, but the framework's `BlockchainTxsIntent` has no value for them.
  blockchain_txs: ["send"],
  staking_txs: ["delegate", "undelegate", "claimReward", "withdraw"],
};
