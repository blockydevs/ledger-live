import type { AssetInfo, Balance, BalanceOptions } from "@ledgerhq/coin-module-framework/api/types";
import type { CryptoCurrency, TokenCurrency } from "../types";
import type { Account, Operation as LiveOperation, StakingResources } from "@ledgerhq/types-live";
import type { ReceiveAddressMatcher } from "../derivation";
import type { IterateResultBuilder } from "../bridge/jsHelpers";

export type ChainSpecificRules = {
  getAccountShape: (address: string) => void;
  getTransactionStatus: {
    throwIfPendingOperation?: boolean;
  };
};

export type BridgeApi = {
  getChainSpecificRules?: ChainSpecificRules;
  getTokenFromAsset?: (asset: AssetInfo) => Promise<TokenCurrency | undefined>;
  getAssetFromToken?: (token: TokenCurrency, owner: string) => AssetInfo;
  computeIntentType?: (transaction: Record<string, unknown>) => string;
  refreshOperations?: (operations: LiveOperation[]) => Promise<LiveOperation[]>;
  validateTransaction?: (signature: string) => Promise<{ error: Error | undefined }>;
  /**
   * Whether the chain surfaces staking data through `getBalance`
   */
  stakingSupported?: boolean;
  /**
   * When true, the chain consumes per-stake positions via
   * `account.stakingPositions` (raw `Stake[]` from `getBalance`) instead of
   * the EVM-style `stakingResources` aggregate. Used by chains where each
   * stake position must be preserved individually (e.g., Tezos Paris upgrade
   * distinguishes delegation vs staking vs unstaking via uid prefix).
   */
  usesStakingPositions?: boolean;
  balanceOptions?: BalanceOptions;
  /**
   * Optional hook called after operations are merged, allowing a chain bridge to
   * enrich the staking resources built from `getBalance` data (e.g. by fetching
   * redelegations from a REST API or reconstructing them from on-chain tx history
   * when the standard API does not surface them).
   *
   * @param currency - The crypto currency of the account being synced.
   * @param address - The account address.
   * @param operations - The full merged operation list.
   * @param stakingResources - The current staking resources to enrich.
   * @returns The enriched staking resources, or the same object unchanged when no enrichment is needed.
   */
  enrichStakingResources?: (
    currency: CryptoCurrency,
    address: string,
    operations: LiveOperation[],
    stakingResources: StakingResources,
  ) => Promise<StakingResources>;
  /**
   * Optional hook called once per signed transaction, right after the framework builds the
   * optimistic operation, letting a chain bridge attach fields the generic builder cannot
   * produce on its own (e.g. a token identifier, a staking-node transition, or an
   * address-checksum rule that differs by asset type within the same chain).
   *
   * @param account - The account the transaction was signed from.
   * @param transaction - The transaction that was just signed.
   * @param operation - The optimistic operation the generic framework built.
   * @returns The enriched operation, or the same object unchanged when no enrichment is needed.
   */
  enrichOptimisticOperation?: (
    account: Account,
    transaction: Record<string, unknown>,
    operation: LiveOperation,
  ) => LiveOperation;
  /**
   * Optional hook called once per synced operation, letting a chain bridge map its own
   * `operation.details` keys into `operation.extra` during sync. The generic adapter only
   * copies a fixed, chain-agnostic allowlist; this hook is where a chain's own key names live,
   * instead of growing that allowlist per family.
   *
   * @param details - The raw `details` bag attached to the synced core operation.
   * @returns The keys to merge into the operation's `extra`.
   */
  mapOperationDetailsToExtra?: (details: Record<string, unknown>) => Record<string, unknown>;
  /**
   * When true, a native operation that pays only a fee (net value, fees excluded, is zero) is
   * kept as its own type instead of being collapsed to `FEES`. The generic builder's default
   * collapse targets chains where such an operation is always a token/contract fee leg — a
   * distinct `FEES` operation would already exist there for that role. Some chains bill a
   * standalone, non-fee-payer operation this way too (e.g. an account-auto-creation
   * sub-transaction, billed as its own `OUT` with no net transfer), where collapsing it would
   * misrepresent it.
   */
  keepFeesOnlyNativeOpType?: boolean;
  /**
   * Optional veto called once per token balance while building sub-accounts, letting a chain
   * bridge suppress a sub-account the generic balance/operation data would otherwise produce
   * (e.g. an untouched token whose on-chain balance reads as zero because balance is a live
   * contract read, not evidence the account ever held or associated with it).
   *
   * @param balance - The token balance entry from `getBalance`.
   * @param token - The resolved token currency for that balance.
   * @param operations - The operations already resolved for that token, before sub-account assembly.
   * @returns `false` to skip building a sub-account for this balance, `true` (or omitted) to build it.
   */
  shouldBuildTokenAccount?: (
    balance: Balance,
    token: TokenCurrency,
    operations: LiveOperation[],
  ) => boolean;
  /**
   * Optional hook to fetch chain-specific account resources that the generic Balance/Stake
   * shape from `getBalance` has no field for. The returned object is spread directly into the
   * synced account, so the chain owns both the key(s) it returns and their values.
   *
   * @param currencyId - The crypto currency id of the account being synced.
   * @param address - The account address.
   * @returns The chain-specific resources ready to spread into the account shape, or undefined
   * when the account does not exist yet.
   */
  fetchAccountResources?: (currencyId: string, address: string) => Promise<object | undefined>;
  /**
   * Optional override for confirming that a device's `getAddress` result belongs to the given
   * account. The default comparison checks the result's address against `account.freshAddress`;
   * set this when the device never computes an address, so account identity must be confirmed
   * some other way.
   */
  receiveAddressMatcher?: ReceiveAddressMatcher;
  /**
   * Optional override for how account scanning iterates derivation indexes. Set this when the
   * chain's account ids are not derivable from the device path alone and must instead be
   * resolved against the network (e.g. looking up which on-chain account ids were created for a
   * device's public key). When omitted, account scanning derives each index's address straight
   * from the device path.
   */
  buildIterateResult?: IterateResultBuilder;
};
