import { useCallback } from "react";
import { useFeature } from "@features/platform-feature-flags";
import { getMainAccount } from "@ledgerhq/live-common/account/index";
import type { Account, AccountLike } from "@ledgerhq/types-live";
import {
  getNewSendFlowAllowedFamilies,
  getNewSendFlowExcludedCurrencyIds,
  isFamilyAllowedForNewSendFlow,
  isValidNewSendFlowConfig,
} from "../utils/newSendFlowConfig";

const getFamilyFromAccount = (
  account?: AccountLike,
  parentAccount?: Account | null,
): string | undefined =>
  account ? getMainAccount(account, parentAccount ?? null).currency.family : undefined;

const getCurrencyIdFromAccount = (
  account?: AccountLike,
  parentAccount?: Account | null,
): string | undefined =>
  account ? getMainAccount(account, parentAccount ?? null).currency.id : undefined;

export function useNewSendFlowFeature() {
  const feature = useFeature("newSendFlow");

  const allowedFamilies = getNewSendFlowAllowedFamilies(feature);
  const excludedCurrencyIds = getNewSendFlowExcludedCurrencyIds(feature);

  const isEnabledForFamily = useCallback(
    (family?: string, currencyId?: string): boolean =>
      isValidNewSendFlowConfig(feature) &&
      isFamilyAllowedForNewSendFlow(
        family,
        getNewSendFlowAllowedFamilies(feature),
        currencyId,
        getNewSendFlowExcludedCurrencyIds(feature),
      ),
    [feature],
  );

  return {
    feature,
    isEnabled: feature?.enabled ?? false,
    isEnabledForFamily,
    getFamilyFromAccount,
    getCurrencyIdFromAccount,
    allowedFamilies,
    excludedCurrencyIds,
  };
}
