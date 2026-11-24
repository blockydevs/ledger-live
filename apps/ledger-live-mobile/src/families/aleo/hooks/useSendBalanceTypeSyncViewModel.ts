import { formatCurrencyUnit } from "@ledgerhq/live-common/currencies/index";
import { getAccountCurrency } from "@ledgerhq/live-common/account/index";
import { useAleoSendRecordLimit } from "@ledgerhq/live-common/families/aleo/react";
import type { AleoAccount, Transaction } from "@ledgerhq/live-common/families/aleo/types";
import { useSelector } from "~/context/hooks";
import { useLocale, useTranslation } from "~/context/Locale";
import { useKeepScreenAwake } from "~/hooks/useKeepScreenAwake";
import { discreetModeSelector } from "~/reducers/settings";
import { useAleoPrivateSync } from "./useAleoPrivateSync";

export type SendBalanceTypeSyncViewModel =
  | Readonly<{ status: "syncing"; title: string; progressLabel: string }>
  | Readonly<{
      status: "error";
      title: string;
      description: string;
      retryLabel: string;
      cancelLabel: string;
      onRetry: () => void;
      onCancel: () => void;
    }>
  | Readonly<{
      status: "recordLimit";
      title: string;
      description: string;
      continueLabel: string;
      onContinue: () => void;
    }>;

export function useSendBalanceTypeSyncViewModel({
  account,
  transaction,
  onComplete,
  onClose,
}: Readonly<{
  account: AleoAccount;
  transaction: Transaction;
  onComplete: () => void;
  onClose: () => void;
}>): SendBalanceTypeSyncViewModel {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const discreet = useSelector(discreetModeSelector);
  const { recordLimit, onAccountUpdated } = useAleoSendRecordLimit({
    subAccountId: transaction.subAccountId,
    onComplete,
  });

  const { progress, isSyncing, error, start } = useAleoPrivateSync({
    account,
    autoStart: true,
    onAccountUpdated,
  });
  useKeepScreenAwake(isSyncing);

  if (error) {
    return {
      status: "error",
      title: t("aleo.send.balanceTypeSync.errorTitle"),
      description: t("aleo.send.balanceTypeSync.errorDescription"),
      retryLabel: t("common.tryAgain"),
      cancelLabel: t("common.cancel"),
      onRetry: start,
      onCancel: onClose,
    };
  }

  if (recordLimit) {
    const unit = getAccountCurrency(recordLimit.account).units[0];
    return {
      status: "recordLimit",
      title: t("aleo.send.balanceTypeSync.recordLimitTitle", {
        amount: formatCurrencyUnit(unit, recordLimit.amount, { showCode: true, locale, discreet }),
      }),
      description: t("aleo.send.balanceTypeSync.recordLimitDescription", {
        maxRecords: recordLimit.maxRecords,
      }),
      continueLabel: t("common.continue"),
      onContinue: onComplete,
    };
  }

  return {
    status: "syncing",
    title: t("aleo.send.balanceTypeSync.title"),
    progressLabel: t("aleo.send.balanceTypeSync.progress", {
      percentage: Math.min(Math.round(progress), 100),
    }),
  };
}
