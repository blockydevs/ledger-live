import { useMemo } from "react";
import type { Account } from "@ledgerhq/types-live";
import { useDispatch } from "LLD/hooks/redux";
import { useLoadedLLDCoinFamily } from "~/renderer/families";

export function useManageAssetsAction(account: Account): (() => void) | undefined {
  const dispatch = useDispatch();
  const family = useLoadedLLDCoinFamily<Account, never, never, never>(account.currency.family);
  const manageAssetsAction = family?.manageAssetsAction;

  return useMemo(() => {
    if (!manageAssetsAction?.canManage(account)) return undefined;

    return () => manageAssetsAction.open({ account, dispatch });
  }, [account, dispatch, manageAssetsAction]);
}
