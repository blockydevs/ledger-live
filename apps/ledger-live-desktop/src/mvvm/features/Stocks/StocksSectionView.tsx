import React, { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Link,
  Subheader,
  SubheaderRow,
  SubheaderTitle,
  SubheaderShowMore,
} from "@ledgerhq/lumen-ui-react";
import { StockPill } from "./components/StockPill";
import { StocksSkeleton } from "./components/StocksSkeleton";
import { splitIntoTwoRows } from "./utils/splitIntoTwoRows";
import { StockSuggestion, StocksHeaderVariant, StocksSectionViewProps } from "./types";

function StocksHeader({
  variant,
  onSeeAll,
}: Readonly<{
  variant: StocksHeaderVariant;
  onSeeAll: () => void;
}>) {
  const { t } = useTranslation();

  if (variant === "explore") {
    return (
      <Subheader>
        <div className="flex items-center gap-24">
          <SubheaderRow className="min-w-0 flex-1">
            <SubheaderTitle>{t("topBar.search.stocks")}</SubheaderTitle>
          </SubheaderRow>
          <Link
            appearance="accent"
            underline={false}
            size="md"
            onClick={onSeeAll}
            className="cursor-pointer"
            data-testid="stocks-explore"
          >
            {t("stocks.explore")}
          </Link>
        </div>
      </Subheader>
    );
  }

  return (
    <Subheader>
      <SubheaderRow
        className="min-w-0 items-center gap-4"
        onClick={onSeeAll}
        data-testid="stocks-see-all"
      >
        <SubheaderTitle>{t("topBar.search.stocks")}</SubheaderTitle>
        <SubheaderShowMore />
      </SubheaderRow>
    </Subheader>
  );
}

/**
 * Collapses to a single scrollable line once the container is wider than the two-row block. The
 * width is read from a hidden copy of that block so the threshold stays stable (no row-count
 * flip-flop between the one-row and two-row widths).
 */
function useCollapseToSingleLine(data: StockSuggestion[]) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [singleLine, setSingleLine] = useState(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const update = () => setSingleLine(container.clientWidth >= measure.scrollWidth);
    update();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [data]);

  return { containerRef, measureRef, singleLine };
}

/** Rows of tightly packed pills. The hidden measurer passes `measurement` to skip the test ids. */
function StockRows({
  rows,
  navigateToAsset,
  measurement = false,
}: Readonly<{
  rows: StockSuggestion[][];
  navigateToAsset: (currencyId: string) => void;
  measurement?: boolean;
}>) {
  return (
    <div className="flex w-max flex-col gap-8">
      {rows.map((rowStocks, rowIndex) => (
        <div
          key={`${rowStocks.join("-")}-${rowIndex}`}
          className="flex gap-8"
          data-testid={measurement ? undefined : "stocks-row"}
        >
          {rowStocks.map(stock => (
            <StockPill
              key={stock.id}
              stock={stock}
              onClick={navigateToAsset}
              measurement={measurement}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Keeps the pills tightly packed and horizontally scrollable: two rows while the window is narrow,
 * collapsing onto a single scrollable line once it is wide enough that the rows would spread apart.
 */
function StocksFillWidth({
  data,
  navigateToAsset,
}: Readonly<{
  data: StockSuggestion[];
  navigateToAsset: (currencyId: string) => void;
}>) {
  const { containerRef, measureRef, singleLine } = useCollapseToSingleLine(data);

  return (
    <div
      ref={containerRef}
      className="scrollbar-none relative overflow-x-auto"
      data-testid="stocks-list"
    >
      <StockRows
        rows={singleLine ? [data] : splitIntoTwoRows(data)}
        navigateToAsset={navigateToAsset}
      />
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0"
        data-testid="stocks-measure"
      >
        <StockRows rows={splitIntoTwoRows(data)} navigateToAsset={navigateToAsset} measurement />
      </div>
    </div>
  );
}

function StocksCarousel({
  data,
  navigateToAsset,
}: Readonly<{
  data: StockSuggestion[];
  navigateToAsset: (currencyId: string) => void;
}>) {
  return (
    <div className="scrollbar-none overflow-x-auto" data-testid="stocks-list">
      <StockRows rows={splitIntoTwoRows(data)} navigateToAsset={navigateToAsset} />
    </div>
  );
}

export function StocksSectionView({
  data,
  isLoading,
  limit,
  navigateToAsset,
  onSeeAll,
  headerVariant = "showMore",
  fillWidth = false,
}: Readonly<StocksSectionViewProps>) {
  if (!isLoading && data.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-8" data-testid="stocks-section">
      <StocksHeader variant={headerVariant} onSeeAll={onSeeAll} />
      {isLoading ? (
        <StocksSkeleton count={limit} />
      ) : fillWidth ? (
        <StocksFillWidth data={data} navigateToAsset={navigateToAsset} />
      ) : (
        <StocksCarousel data={data} navigateToAsset={navigateToAsset} />
      )}
    </div>
  );
}
