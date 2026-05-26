/**
 * Shared wallet-api `custom.navigate` handler for the Borrow live app.
 *
 * Desktop and mobile both register the same `custom.navigate` action on the
 * Borrow webview, so the request parsing and host-side fan-out live here to
 * keep behaviour identical across platforms.
 */

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

export type BorrowNavigateRequest = { params?: BorrowNavigateRequestParams };

export type BorrowNavigateHooks = {
  onGoBack?: () => void;
  onGoToSwap?: (params: BorrowSwapNavigationParams) => void;
};

export type BorrowNavigateHandler = (
  request: BorrowNavigateRequest,
) => Promise<{ success: true }>;

const pickSwapParams = (
  params: BorrowNavigateRequestParams | undefined,
): BorrowSwapNavigationParams => {
  const {
    fromCurrencyId,
    toCurrencyId,
    fromTokenId,
    toTokenId,
    fromAccountId,
    toAccountId,
    amountFrom,
    affiliate,
  } = params ?? {};
  return {
    fromCurrencyId,
    toCurrencyId,
    fromTokenId,
    toTokenId,
    fromAccountId,
    toAccountId,
    amountFrom,
    affiliate,
  };
};

export const createBorrowNavigateHandler =
  ({ onGoBack, onGoToSwap }: BorrowNavigateHooks): BorrowNavigateHandler =>
  async request => {
    const action = request.params?.action;

    if (action === "go-back") {
      onGoBack?.();
      return { success: true };
    }

    if (action === "go-to-swap") {
      onGoToSwap?.(pickSwapParams(request.params));
      return { success: true };
    }

    throw new Error("Unknown borrow navigation action");
  };
