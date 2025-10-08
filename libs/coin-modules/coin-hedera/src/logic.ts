import { AccountId } from "@hashgraph/sdk";
import { getEnv } from "@ledgerhq/live-env";
import { findSubAccountById, isTokenAccount } from "@ledgerhq/coin-framework/account/helpers";
import type { ExplorerView, TokenCurrency } from "@ledgerhq/types-cryptoassets";
import type { Account, AccountLike, Operation } from "@ledgerhq/types-live";
import type {
  HederaAccount,
  HederaOperationExtra,
  HederaValidator,
  TransactionStaking,
  TransactionTokenAssociate,
  Transaction,
  TransactionStatus,
} from "./types";
import { getClient } from "./api/network";
import { HederaMirrorTransaction } from "./api/types";
import {
  HEDERA_DELEGATION_STATUS,
  HEDERA_OPERATION_TYPES,
  HEDERA_TRANSACTION_MODES,
} from "./constants";
import { getCurrentHederaPreloadData } from "./preload-data";

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

const extractCompanyFromNodeDescription = (description: string): string => {
  return description
    .split("|")[0]
    .replace(/hosted by/i, "")
    .replace(/hosted for/i, "")
    .trim();
};

const sortValidators = (validators: HederaValidator[]): HederaValidator[] => {
  const ledgerNodeId = getEnv("HEDERA_STAKING_LEDGER_NODE_ID");

  // sort validators by active stake in ASC order, with Ledger node first if it exists
  return validators.sort((a, b) => {
    if (typeof ledgerNodeId === "number") {
      if (a.nodeId === ledgerNodeId) return -1;
      if (b.nodeId === ledgerNodeId) return 1;
    }

    return a.activeStake.toNumber() - b.activeStake.toNumber();
  });
};

const filterValidatorBySearchTerm = (validator: HederaValidator, search: string): boolean => {
  const lowercaseSearch = search.toLowerCase();
  const addressWithChecksum = validator.addressChecksum
    ? `${validator.address}-${validator.addressChecksum}`
    : validator.address;

  return (
    validator.nodeId.toString().includes(lowercaseSearch) ||
    validator.name.toLowerCase().includes(lowercaseSearch) ||
    addressWithChecksum.toLowerCase().includes(lowercaseSearch)
  );
};

const getValidatorFromAccount = (account: HederaAccount): HederaValidator | null => {
  const { delegation } = account.hederaResources ?? {};

  if (!delegation) {
    return null;
  }

  const validators = getCurrentHederaPreloadData(account.currency);
  const validator = validators.validators.find(v => v.nodeId === delegation.nodeId) ?? null;

  return validator;
};

const getHederaOperationType = (
  account: Account,
  tx: Transaction | null | undefined,
): HEDERA_OPERATION_TYPES => {
  const subAccount = findSubAccountById(account, tx?.subAccountId || "");
  const isTokenTransaction = isTokenAccount(subAccount);

  if (!tx) {
    return HEDERA_OPERATION_TYPES.CryptoTransfer;
  }

  if (isTokenAssociateTransaction(tx)) {
    return HEDERA_OPERATION_TYPES.TokenAssociate;
  }

  if (isTokenTransaction) {
    return HEDERA_OPERATION_TYPES.TokenTransfer;
  }

  if (isStakingTransaction(tx)) {
    return HEDERA_OPERATION_TYPES.CryptoUpdate;
  }

  return HEDERA_OPERATION_TYPES.CryptoTransfer;
};

const getMemo = (tx: HederaMirrorTransaction): string | null => {
  return tx.memo_base64 ? Buffer.from(tx.memo_base64, "base64").toString("utf-8") : null;
};

const getDefaultValidator = (validators: HederaValidator[]): HederaValidator | null => {
  if (validators.length === 0) return null;
  const ledgerNodeId = getEnv("HEDERA_STAKING_LEDGER_NODE_ID");
  const ledgerValidator = validators.find(v => v.nodeId === ledgerNodeId);

  if (ledgerValidator) {
    return ledgerValidator;
  }

  const lowestActiveStakeValidator = validators.reduce((prev, current) =>
    current.activeStake.lt(prev.activeStake) ? current : prev,
  );

  return lowestActiveStakeValidator;
};

const getDelegationStatus = (validator: HederaValidator | null): HEDERA_DELEGATION_STATUS => {
  if (!validator) {
    return HEDERA_DELEGATION_STATUS.Inactive;
  }

  if (validator.overstaked) {
    return HEDERA_DELEGATION_STATUS.Overstaked;
  }

  return HEDERA_DELEGATION_STATUS.Active;
};

const isStakingTransaction = (tx: Transaction | null | undefined): tx is TransactionStaking => {
  return (
    !!tx &&
    (tx.mode === HEDERA_TRANSACTION_MODES.Delegate ||
      tx.mode === HEDERA_TRANSACTION_MODES.Undelegate ||
      tx.mode === HEDERA_TRANSACTION_MODES.Redelegate ||
      tx.mode === HEDERA_TRANSACTION_MODES.ClaimRewards)
  );
};

const isTokenAssociateTransaction = (
  tx: Transaction | null | undefined,
): tx is TransactionTokenAssociate => {
  return !!tx && tx.mode === HEDERA_TRANSACTION_MODES.TokenAssociate;
};

const isAutoTokenAssociationEnabled = (account: AccountLike) => {
  const hederaAccount = "hederaResources" in account ? (account as HederaAccount) : null;

  return hederaAccount?.hederaResources?.isAutoTokenAssociationEnabled ?? false;
};

const isTokenAssociationRequired = (
  account: AccountLike,
  token: TokenCurrency | null | undefined,
) => {
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

const getChecksum = (accountId: string): string | null => {
  try {
    const client = getClient();
    const accountIdWithChecksum = AccountId.fromString(accountId).toStringWithChecksum(client);
    return accountIdWithChecksum.split("-")[1] ?? null;
  } catch {
    return null;
  }
};

export {
  sendRecipientCanNext,
  getTransactionExplorer,
  isStakingTransaction,
  extractCompanyFromNodeDescription,
  sortValidators,
  filterValidatorBySearchTerm,
  getValidatorFromAccount,
  getDefaultValidator,
  getHederaOperationType,
  getDelegationStatus,
  getMemo,
  isValidExtra,
  isTokenAssociateTransaction,
  isTokenAssociationRequired,
  isAutoTokenAssociationEnabled,
  getChecksum,
};
