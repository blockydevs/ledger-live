import type { AccountBridge, CurrencyBridge, TransactionCommon } from "@ledgerhq/types-live";
import type { TokenCurrency } from "@ledgerhq/types-cryptoassets";
import type { ScenarioTransaction } from "@ledgerhq/coin-tester/main";
import type { HederaAccount, TransactionStatus } from "@ledgerhq/coin-hedera/types";
import type { CanonicalHederaTransaction } from "./canonicalTransaction";

export type HederaBridgeSetup<T extends TransactionCommon> = (
  tokens: TokenCurrency[],
  maxAutomaticTokenAssociations?: number,
) => Promise<{
  currencyBridge: CurrencyBridge;
  accountBridge: AccountBridge<T, HederaAccount, TransactionStatus>;
  publicKey: string;
  accountId: string;
  close: () => void;
}>;

/**
 * Everything a scenario needs to run against one specific bridge: how to set it up, how to turn
 * a canonical transaction into that bridge's own transaction type, and how to read staking state
 * back off an account synced through that bridge.
 */
export type HederaBridgeTarget<T extends TransactionCommon> = {
  setup: HederaBridgeSetup<T>;
  toTransaction: (canonical: CanonicalHederaTransaction) => ScenarioTransaction<T, HederaAccount>;
  getStakingNodeId: (account: HederaAccount) => number | null;
};
