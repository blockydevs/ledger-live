import { WalletAPICustomHandlers } from "@ledgerhq/live-common/wallet-api/types";
import React, { useEffect, useMemo } from "react";
import { BorrowLiveAppView } from ".";
import { useBorrowLiveAppViewModel } from "LLM/features/Borrow/screens/BorrowLiveApp/useBorrowLiveAppViewModel";

export type BorrowSwapNavigationParams = {
  fromCurrencyId?: string;
  toCurrencyId?: string;
  fromTokenId?: string;
  toTokenId?: string;
  fromAccountId?: string;
  toAccountId?: string;
  amountFrom?: string;
  affiliate?: string;
};

type BorrowNavigateRequestParams = {
  action?: string;
} & BorrowSwapNavigationParams;

type BorrowLiveAppWrapperProps = Readonly<{
  action?: "go-back";
  onNativeGoBack?: () => void;
  onActionHandled?: () => void;
  onWalletApiGoBack?: () => void;
  onWalletApiGoToSwap?: (params: BorrowSwapNavigationParams) => void;
}>;

export function BorrowLiveAppWrapper({
  action,
  onNativeGoBack,
  onActionHandled,
  onWalletApiGoBack,
  onWalletApiGoToSwap,
}: BorrowLiveAppWrapperProps) {
  const { manifest, error, isLoading, webviewRef, webviewState, onWebviewStateChange, webviewInputs } =
    useBorrowLiveAppViewModel();
  const isSetupAmountStep = webviewState.url.includes("/loan");

  const customHandlers = useMemo<WalletAPICustomHandlers>(
    () => ({
      "custom.navigate": async (request: { params?: BorrowNavigateRequestParams }) => {
        const requestAction = request.params?.action;

        if (requestAction === "go-back") {
          onWalletApiGoBack?.();
          return { success: true };
        }

        if (requestAction === "go-to-swap") {
          const {
            fromCurrencyId,
            toCurrencyId,
            fromTokenId,
            toTokenId,
            fromAccountId,
            toAccountId,
            amountFrom,
            affiliate,
          } = request.params ?? {};
          onWalletApiGoToSwap?.({
            fromCurrencyId,
            toCurrencyId,
            fromTokenId,
            toTokenId,
            fromAccountId,
            toAccountId,
            amountFrom,
            affiliate,
          });
          return { success: true };
        }

        throw new Error("Unknown borrow navigation action");
      },
    }),
    [onWalletApiGoBack, onWalletApiGoToSwap],
  );

  useEffect(() => {
    if (action !== "go-back") {
      return;
    }

    if (webviewState.canGoBack && isSetupAmountStep) {
      webviewRef.current?.goBack();
    } else {
      onNativeGoBack?.();
    }

    onActionHandled?.();
  }, [
    action,
    isSetupAmountStep,
    onActionHandled,
    onNativeGoBack,
    webviewRef,
    webviewState.canGoBack,
  ]);

  return (
    <BorrowLiveAppView
      manifest={manifest}
      error={error}
      isLoading={isLoading}
      webviewRef={webviewRef}
      onWebviewStateChange={onWebviewStateChange}
      webviewInputs={webviewInputs}
      customHandlers={customHandlers}
    />
  );
}
