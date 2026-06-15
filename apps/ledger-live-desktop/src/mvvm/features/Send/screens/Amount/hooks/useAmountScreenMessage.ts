import { useMemo } from "react";
import type { TransactionStatus } from "@ledgerhq/live-common/generated/types";
import type { CryptoOrTokenCurrency } from "@ledgerhq/types-cryptoassets";
import { getCryptoCurrencyById } from "@ledgerhq/cryptoassets";
import { useTranslatedBridgeError } from "../../Recipient/hooks/useTranslatedBridgeError";
import {
  getAmountScreenRawMessage,
  isAmountInputDisabledByRecipientError,
} from "@ledgerhq/live-common/flows/send/amount/utils/messages";
import type { AmountScreenMessage } from "../types";

export function useAmountScreenMessage(params: {
  status: TransactionStatus;
  hasRawAmount: boolean;
}): Readonly<{
  amountMessage: AmountScreenMessage | null;
  isAmountInputDisabled: boolean;
}> {
  const rawAmountMessage = useMemo(
    () => getAmountScreenRawMessage({ status: params.status, hasRawAmount: params.hasRawAmount }),
    [params.hasRawAmount, params.status],
  );
  const translatedAmountMessage = useTranslatedBridgeError(rawAmountMessage?.error);

  const amountMessage = useMemo((): AmountScreenMessage | null => {
    if (!rawAmountMessage || !translatedAmountMessage?.title) return null;

    return {
      type: rawAmountMessage.type,
      text: translatedAmountMessage.title,
      error: rawAmountMessage.error,
    };
  }, [rawAmountMessage, translatedAmountMessage?.title]);

  const isAmountInputDisabled = useMemo(
    () => isAmountInputDisabledByRecipientError(params.status),
    [params.status],
  );

  // Always hide "AmountRequired" error - the Review button is already disabled when there's no amount,
  // so this error message provides no value and causes visual glitches during input
  const isAmountRequiredError = params.status.errors?.amount?.name === "AmountRequired";

  const amountErrorTitle = amountError && !isAmountRequiredError ? amountError.title : undefined;
  const amountWarningTitle = amountWarning ? amountWarning.title : undefined;

  const isFeeTooHigh =
    params.status.warnings?.amount?.name === "FeeTooHigh" ||
    params.status.warnings?.feeTooHigh?.name === "FeeTooHigh";

  const cryptoCurrency =
    params.accountCurrency?.type === "TokenCurrency"
      ? getCryptoCurrencyById(params.accountCurrency.parentCurrencyId)
      : params.accountCurrency;

  const isStellarMultisignBlocked =
    cryptoCurrency?.family === "stellar" && recipientErrorRaw?.name === "StellarSourceHasMultiSign";

  const multisignMessage =
    isStellarMultisignBlocked && recipientError?.title
      ? ({ type: "error", text: recipientError.title, error: recipientErrorRaw } as const)
      : null;

  const baseAmountMessage = useMemo((): AmountScreenMessage | null => {
    if (!params.hasRawAmount) return null;

    if (amountErrorTitle) {
      return { type: "error", text: amountErrorTitle, error: params.status.errors?.amount };
    }

    if (otherBlockingError?.title) {
      return { type: "error", text: otherBlockingError.title, error: otherBlockingErrorRaw };
    }

    const amountMessage = getAmountScreenMessage({
      amountWarningTitle,
      isFeeTooHigh,
      hasRawAmount: params.hasRawAmount,
    });

    return amountMessage ? { ...amountMessage, error: amountWarningRaw } : null;
  }, [
    params.hasRawAmount,
    params.status.errors?.amount,
    amountErrorTitle,
    otherBlockingError?.title,
    otherBlockingErrorRaw,
    amountWarningTitle,
    amountWarningRaw,
    isFeeTooHigh,
  ]);

  const amountMessage = multisignMessage ?? baseAmountMessage;

  return { amountMessage, isStellarMultisignBlocked };
}
