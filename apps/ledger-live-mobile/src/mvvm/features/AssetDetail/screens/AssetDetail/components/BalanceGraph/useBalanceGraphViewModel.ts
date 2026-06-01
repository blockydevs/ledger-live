import { useCallback, useEffect, useMemo, useState } from "react";
import BigNumber from "bignumber.js";
import type { AssetDetailCurrencyProps } from "LLM/features/AssetDetail/types";
import type { FormattedValue } from "@ledgerhq/lumen-ui-rnative";
import { getAccountCurrency } from "@ledgerhq/live-common/account/index";
import { useAssetChartData } from "@ledgerhq/live-common/market/hooks/useMarketDataProvider";
import {
  formatPrice,
  formatPriceFragment,
  formatSignedFiatVariation,
} from "@ledgerhq/live-currency-format";
import { useSelector } from "~/context/hooks";
import { flattenAccountsSelector } from "~/reducers/accounts";
import { counterValueCurrencySelector } from "~/reducers/settings";
import { track } from "~/analytics";
import { useTranslation, useLocale } from "~/context/Locale";
import { useOpenReceiveDrawer } from "LLM/features/Receive";
import {
  resolveLineChartColorFromPercentChange,
  type LineChartScrubberPositionChange,
  type LineChartSeries,
  type LineChartTooltipTitle,
  type LineChartValueFormatter,
  type LineChartXAxisConfig,
  type LineChartYAxisConfig,
} from "LLM/components/LineChart";
import {
  BALANCE_GRAPH_RANGES,
  RANGE_TO_PRICE_CHANGE_KEY,
  isRangeKey,
  type RangeKey,
} from "../../utils/rangeMapping";
import { useAssetMarketData } from "../../hooks/useAssetMarketData";

const MIN_X_AXIS_TICKS = 5;
const MIN_X_AXIS_TICKS_1D = 8;

/**
 * Asymmetric padding added to the y-axis domain (as a ratio of the value range).
 * Most of it sits at the bottom to lift the lowest point off the x-axis so its
 * "below" label clears the x-axis tick labels, while the top stays nearly tight
 * so the line keeps its amplitude and does not look flat.
 */
const Y_AXIS_PADDING_BOTTOM_RATIO = 0.12;
const Y_AXIS_PADDING_TOP_RATIO = 0.04;

/**
 * Returns evenly spaced data indices (always including the first and last point)
 * so the x-axis renders at least `minTicks` labels when enough data is available.
 */
function getEvenlySpacedTicks(length: number, minTicks: number): number[] {
  if (length <= 0) return [];
  if (length <= minTicks) return Array.from({ length }, (_, index) => index);

  const ticks = Array.from({ length: minTicks }, (_, index) =>
    Math.round((index * (length - 1)) / (minTicks - 1)),
  );
  return Array.from(new Set(ticks));
}

/**
 * Hovered chart point while scrubbing. Holds raw values only (formatting stays
 * in the view model); shaped as an object so more fields (e.g. variation) can be
 * added later without touching the scrub plumbing.
 */
type ScrubSelection = Readonly<{ price: number; timestamp: number }>;

type Params = {
  currency?: AssetDetailCurrencyProps;
  marketApiId?: string;
  knownLedgerIds?: readonly string[];
  knownMarketId?: string;
  hideReceive?: boolean;
};

export function useBalanceGraphViewModel({
  currency,
  marketApiId,
  knownLedgerIds,
  knownMarketId,
  hideReceive,
}: Params) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const counterValueCurrency = useSelector(counterValueCurrencySelector);
  const counterValueUnit = counterValueCurrency.units[0];
  const { marketCurrency, counterCurrency, isLoading } = useAssetMarketData({
    marketApiId,
    knownLedgerIds,
    knownMarketId,
  });

  const [range, setRange] = useState<RangeKey>("1d");
  const [selection, setSelection] = useState<ScrubSelection | undefined>(undefined);

  const id =
    knownLedgerIds?.[0] ?? marketCurrency?.ledgerIds?.[0] ?? marketCurrency?.id ?? marketApiId;

  const { data: chartData, isLoading: isChartLoading } = useAssetChartData(
    { id, counterCurrency, range },
    { skip: !id },
  );

  const ranges = useMemo(
    () =>
      BALANCE_GRAPH_RANGES.map(r => ({
        label: t(`assetDetail.balanceGraph.range.${r}`),
        value: r,
      })),
    [t],
  );

  const onRangeChange = useCallback(
    (value: RangeKey) => {
      if (value === range) return;
      setSelection(undefined);
      setRange(value);
      track("button_clicked", {
        button: "timeframe",
        timeframe: value,
        page: "Asset Detail",
        currency: currency?.id,
      });
    },
    [range, currency?.id],
  );

  const price = marketCurrency?.price;
  const priceChangePercentage =
    marketCurrency?.priceChangePercentage[RANGE_TO_PRICE_CHANGE_KEY[range]];

  const priceFormatter = useCallback(
    (value: number): FormattedValue => formatPriceFragment(counterValueUnit, value, locale),
    [counterValueUnit, locale],
  );

  const formattedPriceChange = useMemo(() => {
    if (priceChangePercentage == null || price == null) return undefined;
    const delta = price * (priceChangePercentage / 100);
    return formatSignedFiatVariation(delta, counterValueUnit, locale);
  }, [priceChangePercentage, price, locale, counterValueUnit]);

  const rangeTimeLabel = t(`assetDetail.balanceGraph.timeLabel.${range}`);

  // Flatten so token sub-accounts (e.g. ERC-20 stablecoins held inside an
  // Ethereum parent account) are inspected too. Using parent accounts alone
  // would miss token balances and incorrectly surface the Receive CTA on a
  // funded token asset.
  const flatAccounts = useSelector(flattenAccountsSelector);

  const showReceive = useMemo(() => {
    if (hideReceive || !currency) return false;
    const hasAssetFunds = flatAccounts.some(
      a => getAccountCurrency(a).id === currency.id && a.balance.gt(0),
    );
    const hasFundsElsewhere = flatAccounts.some(
      a => getAccountCurrency(a).id !== currency.id && a.balance.gt(0),
    );
    return !hasAssetFunds && hasFundsElsewhere;
  }, [hideReceive, flatAccounts, currency]);

  const { handleOpenReceiveDrawer } = useOpenReceiveDrawer({
    currency,
    sourceScreenName: "Asset Detail",
  });

  const onReceivePress = useCallback(() => {
    track("button_clicked", {
      button: "receive",
      page: "Asset Detail",
      currency: currency?.id,
    });
    handleOpenReceiveDrawer();
  }, [handleOpenReceiveDrawer, currency?.id]);

  const { series, timestamps } = useMemo(() => {
    const points = chartData?.[range] ?? [];
    const data: number[] = [];
    const tsList: number[] = [];
    points.forEach(([timestamp, value]) => {
      data.push(value);
      tsList.push(timestamp);
    });
    return {
      series: [
        {
          id: "asset-detail-price",
          data,
          label: "Price",
          // `stroke` is required by the Series type but is overridden by the
          // shared LineChart from the `color` prop.
          stroke: "",
        },
      ] satisfies LineChartSeries[],
      timestamps: tsList,
    };
  }, [chartData, range]);
  const prices = series[0].data;
  const onScrubberPositionChange = useCallback<LineChartScrubberPositionChange>(
    index => {
      if (index == null) return setSelection(undefined);
      const scrubPrice = prices[index];
      const timestamp = timestamps[index];
      setSelection(
        Number.isFinite(scrubPrice) && timestamp != null
          ? { price: scrubPrice, timestamp }
          : undefined,
      );
    },
    [prices, timestamps],
  );

  useEffect(() => {
    setSelection(undefined);
  }, [id]);

  const isScrubbing = selection != null;
  const displayedPrice = selection?.price ?? price ?? 0;

  const chartColor = resolveLineChartColorFromPercentChange(priceChangePercentage);

  const formatValue = useCallback<LineChartValueFormatter>(
    value =>
      formatPrice(counterValueUnit, new BigNumber(value).times(10 ** counterValueUnit.magnitude), {
        showCode: true,
        locale,
      }),
    [counterValueUnit, locale],
  );

  // Mirror desktop's `hourFormat` / `dayFormat`: intraday shows the time, longer
  // ranges show the full numeric day/month/year (e.g. "5/29/2026").
  const dateFormatters = useMemo(
    () => ({
      hour: new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "numeric" }),
      day: new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "numeric",
        year: "numeric",
      }),
    }),
    [locale],
  );
  const formatDate = useCallback(
    (date: Date) => (range === "1d" ? dateFormatters.hour : dateFormatters.day).format(date),
    [range, dateFormatters],
  );

  const scrubbedDateLabel =
    selection != null ? formatDate(new Date(selection.timestamp)) : undefined;

  const tooltipTitle = useCallback<LineChartTooltipTitle>(
    dataIndex => {
      const timestamp = timestamps[dataIndex];
      if (timestamp == null) return undefined;
      return formatDate(new Date(timestamp));
    },
    [timestamps, formatDate],
  );

  const xAxis = useMemo<LineChartXAxisConfig>(
    () => ({
      showLine: false,
      ticks: getEvenlySpacedTicks(
        timestamps.length,
        range === "1d" ? MIN_X_AXIS_TICKS_1D : MIN_X_AXIS_TICKS,
      ),
      tickLabelFormatter: value => {
        const timestamp = timestamps[Number(value)];
        return timestamp == null ? "" : formatDate(new Date(timestamp));
      },
    }),
    [timestamps, formatDate, range],
  );

  const yAxis = useMemo<LineChartYAxisConfig>(
    () => ({
      domain: ({ min, max }) => {
        const valueRange = max - min || Math.abs(max) || 1;
        return {
          min: min - valueRange * Y_AXIS_PADDING_BOTTOM_RATIO,
          max: max + valueRange * Y_AXIS_PADDING_TOP_RATIO,
        };
      },
    }),
    [],
  );

  return {
    price: displayedPrice,
    priceFormatter,
    hasMarketData: price != null,
    priceChangePercentage: priceChangePercentage ?? 0,
    formattedPriceChange,
    rangeTimeLabel,
    ranges,
    selectedRange: range,
    onRangeChange,
    isRangeValue: isRangeKey,
    showReceive,
    onReceivePress,
    isLoading: isLoading || isChartLoading,
    series,
    chartColor,
    formatValue,
    tooltipTitle,
    onScrubberPositionChange,
    isScrubbing,
    scrubbedDateLabel,
    showXAxis: true,
    showYAxis: false,
    xAxis,
    yAxis,
  };
}
