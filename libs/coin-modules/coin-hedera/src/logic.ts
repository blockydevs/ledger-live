import { ExplorerView, TokenCurrency } from "@ledgerhq/types-cryptoassets";
import { AccountLike, Operation } from "@ledgerhq/types-live";

import { HederaOperationExtra } from "./types";

const getTransactionExplorer = (
  explorerView: ExplorerView | null | undefined,
  operation: Operation,
): string | undefined => {
  const extra = operation.extra as HederaOperationExtra;

  return explorerView?.tx?.replace("$hash", extra.consensusTimestamp ?? extra.transactionId ?? "0");
};

const isTokenAssociationRequired = (
  account: AccountLike,
  token: TokenCurrency | null | undefined,
  receiveTokenMode: boolean,
) => {
  const subAccounts = !!account && "subAccounts" in account ? account.subAccounts ?? [] : [];
  const isTokenAssociated = subAccounts.some(item => item.token.id === token?.id);
  const isAssociationFlow = receiveTokenMode && !!token && !isTokenAssociated;

  return isAssociationFlow;
};

export { getTransactionExplorer, isTokenAssociationRequired };
