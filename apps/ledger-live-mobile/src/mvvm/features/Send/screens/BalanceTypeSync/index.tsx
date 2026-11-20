import React from "react";
import { useBalanceTypeSyncScreenViewModel } from "./hooks/useBalanceTypeSyncScreenViewModel";

export function BalanceTypeSyncScreen() {
  const viewModel = useBalanceTypeSyncScreenViewModel();
  const { BalanceTypeSync, account, transaction } = viewModel;

  const isSlotReady = BalanceTypeSync && account && transaction;
  if (!isSlotReady) return null;

  return (
    <BalanceTypeSync
      account={account}
      transaction={transaction}
      onComplete={viewModel.onComplete}
      onClose={viewModel.onClose}
    />
  );
}
