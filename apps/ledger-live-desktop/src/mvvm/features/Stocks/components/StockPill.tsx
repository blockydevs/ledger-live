import React from "react";
import { CryptoIcon } from "@ledgerhq/crypto-icons";
import { MediaButton } from "@ledgerhq/lumen-ui-react";
import { StockSuggestion } from "../types";

type StockPillProps = {
  stock: StockSuggestion;
  onClick: (currencyId: string) => void;
  /** Hidden copy used only to measure the natural one-line width; skips the test id to stay unique. */
  measurement?: boolean;
};

export function StockPill({ stock, onClick, measurement = false }: Readonly<StockPillProps>) {
  const { name, ticker, ledgerId, navigationId } = stock;

  if (!ledgerId) return null;

  const leadingContent = <CryptoIcon ledgerId={ledgerId} ticker={ticker} size={24} />;

  return (
    <MediaButton
      size="sm"
      hideChevron
      leadingContent={leadingContent}
      leadingContentShape="rounded"
      className="shrink-0"
      onClick={() => onClick(navigationId)}
      aria-label={name}
      data-testid={measurement ? undefined : `stock-item-ticker-${ticker.toLowerCase()}`}
    >
      {ticker.toUpperCase()}
    </MediaButton>
  );
}
