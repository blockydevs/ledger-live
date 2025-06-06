import type { ExplorerView, TokenCurrency } from "@ledgerhq/types-cryptoassets";
import type { AccountLike, Operation } from "@ledgerhq/types-live";
import type {
  HederaAccount,
  HederaOperationExtra,
  TokenAssociateProperties,
  Transaction,
} from "./types";

const getTransactionExplorer = (
  explorerView: ExplorerView | null | undefined,
  operation: Operation,
): string | undefined => {
  const extra = operation.extra as HederaOperationExtra;

  return explorerView?.tx?.replace("$hash", extra.consensusTimestamp ?? extra.transactionId ?? "0");
};

const isTokenAssociateTransaction = (
  tx: Transaction,
): tx is Extract<Required<Transaction>, { properties: TokenAssociateProperties }> => {
  return tx.properties?.name === "tokenAssociate";
};

const isTokenAssociationRequired = (
  account: AccountLike,
  token: TokenCurrency | null | undefined,
) => {
  const subAccounts = !!account && "subAccounts" in account ? account.subAccounts ?? [] : [];
  const isTokenAssociated = subAccounts.some(item => item.token.id === token?.id);
  const isAutoTokenAssociationsEnabled =
    (account as HederaAccount).hederaResources?.isAutoTokenAssociationsEnabled ?? false;

  return !!token && !isTokenAssociated && !isAutoTokenAssociationsEnabled;
};

const isValidExtra = (extra: unknown): extra is HederaOperationExtra => {
  return !!extra && typeof extra === "object" && !Array.isArray(extra);
};

export {
  getTransactionExplorer,
  isValidExtra,
  isTokenAssociateTransaction,
  isTokenAssociationRequired,
};
