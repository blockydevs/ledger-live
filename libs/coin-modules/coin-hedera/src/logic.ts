import { AccountId, TransactionId } from "@hashgraph/sdk";
import type { ExplorerView, TokenCurrency } from "@ledgerhq/types-cryptoassets";
import type { AccountLike, Operation } from "@ledgerhq/types-live";
import { HEDERA_TRANSACTION_MODES } from "./constants";
import type { HederaAccount, HederaOperationExtra, Transaction, TransactionStatus } from "./types";

const getTransactionExplorer = (
  explorerView: ExplorerView | null | undefined,
  operation: Operation,
): string | undefined => {
  const extra = isValidExtra(operation.extra) ? operation.extra : null;

  return explorerView?.tx?.replace(
    "$hash",
    extra?.consensusTimestamp ?? extra?.transactionId ?? "0",
  );
};

const isTokenAssociateTransaction = (
  tx: Transaction,
): tx is Extract<Transaction, { mode: typeof HEDERA_TRANSACTION_MODES.TokenAssociate }> => {
  return tx.mode === HEDERA_TRANSACTION_MODES.TokenAssociate;
};

const isAutoTokenAssociationEnabled = (account: AccountLike) => {
  const hederaAccount = "hederaResources" in account ? (account as HederaAccount) : null;

  return hederaAccount?.hederaResources?.isAutoTokenAssociationEnabled ?? false;
};

const isTokenAssociationRequired = (
  account: AccountLike,
  token: TokenCurrency | null | undefined,
) => {
  if (token?.tokenType !== "hts") {
    return false;
  }

  const subAccounts = !!account && "subAccounts" in account ? account.subAccounts ?? [] : [];
  const isTokenAssociated = subAccounts.some(item => item.token.id === token?.id);

  return !!token && !isTokenAssociated && !isAutoTokenAssociationEnabled(account);
};

const isValidExtra = (extra: unknown): extra is HederaOperationExtra => {
  return !!extra && typeof extra === "object" && !Array.isArray(extra);
};

// disables the "Continue" button in the Send modal's Recipient step during token transfers if:
// - the recipient is not associated with the token
// - the association status can't be verified
const sendRecipientCanNext = (status: TransactionStatus) => {
  const { missingAssociation, unverifiedAssociation } = status.warnings;

  return !missingAssociation && !unverifiedAssociation;
};

const formatTransactionId = (transactionId: TransactionId): string => {
  const [accountId, timestamp] = transactionId.toString().split("@");
  const [secs, nanos] = timestamp.split(".");

  return `${accountId}-${secs}-${nanos}`;
};

const getMemoFromBase64 = (memoBase64: string | undefined): string | null => {
  if (typeof memoBase64 !== "string") return null;

  try {
    return Buffer.from(memoBase64, "base64").toString("utf-8");
  } catch {
    return null;
  }
};

/**
 * Converts a Hedera account ID (e.g. "0.0.1234") into its corresponding EVM address in hexadecimal format.
 * If the conversion fails, it returns null.
 *
 * @param address - Hedera account ID in the format `shard.realm.num`
 * @returns the long-zero EVM address (`0x...`) or null if conversion fails
 */
const toEVMAddress = (accountId: string) => {
  try {
    const evmAddress = "0x" + AccountId.fromString(accountId).toEvmAddress();
    return evmAddress as `0x${string}`;
  } catch {
    return null;
  }
};

/**
 * Converts EVM address in hexadecimal format to its corresponding Hedera account ID.
 * Only long-zero addresses can be mathematically converted back to account IDs.
 * Non-long-zero addresses support would require mirror node call and is not needed for now
 * Uses shard 0 and realm 0 by default for the conversion.
 * If the conversion fails, it returns null.
 *
 * @param evmAddress - EVM address in hexadecimal format (should start with '0x')
 * @param shard - Optional shard ID (defaults to 0)
 * @param realm - Optional realm ID (defaults to 0)
 * @returns Hedera account ID in the format `shard.realm.num` or null if conversion fails
 */
const fromEVMAddress = (evmAddress: string, shard = 0, realm = 0): string | null => {
  try {
    const isLongZeroAddress = evmAddress.includes("0".repeat(20));

    if (!isLongZeroAddress) {
      return null;
    }

    const accountId = AccountId.fromEvmAddress(shard, realm, evmAddress).toString();
    return accountId;
  } catch {
    return null;
  }
};

export {
  sendRecipientCanNext,
  getTransactionExplorer,
  formatTransactionId,
  isValidExtra,
  isTokenAssociateTransaction,
  isTokenAssociationRequired,
  isAutoTokenAssociationEnabled,
  getMemoFromBase64,
  fromEVMAddress,
  toEVMAddress,
};
