import {
  KeysPriceChange,
  MarketCurrencyData,
  type PartialMarketItemResponse,
} from "@ledgerhq/live-common/market/utils/types";
import { formatPrice } from "@ledgerhq/live-currency-format";
import type { CryptoOrTokenCurrency, Unit } from "@ledgerhq/types-cryptoassets";
import type { TFunction } from "i18next";
import BigNumber from "bignumber.js";
import type { MarketAssetDisplayData } from "LLM/components/AssetListItem";
import { counterValueFormatter } from "./index";

interface MapOptions {
  counterCurrency: string;
  counterValueUnit: Unit;
  range: KeysPriceChange;
  locale: string;
  t: TFunction;
}

type DadaAssetDisplaySource = {
  id: string;
  name: string;
  ticker: string;
};

export function mapMarketCurrencyToDisplayData(
  item: MarketCurrencyData,
  { counterCurrency, counterValueUnit, range, locale, t }: MapOptions,
): MarketAssetDisplayData {
  const change = item.priceChangePercentage[range];
  const priceChangePercentage = typeof change === "number" && Number.isFinite(change) ? change : 0;
  const priceAtoms = new BigNumber(item.price).times(
    new BigNumber(10).pow(counterValueUnit.magnitude),
  );

  return {
    id: item.id,
    name: item.name,
    ticker: item.ticker,
    ledgerIds: item.ledgerIds,
    formattedMarketCap:
      item.marketcap == null
        ? "-"
        : counterValueFormatter({
            currency: counterCurrency,
            value: item.marketcap,
            shorten: true,
            locale,
            t,
          }),
    marketcapRank: item.marketcapRank,
    formattedPrice: formatPrice(counterValueUnit, priceAtoms, { locale, showCode: true }),
    priceChangePercentage,
  };
}

export function mapDadaMarketAssetToDisplayData(
  asset: DadaAssetDisplaySource,
  currency: CryptoOrTokenCurrency | undefined,
  market: PartialMarketItemResponse,
  { counterCurrency, counterValueUnit, range, locale, t }: MapOptions,
): MarketAssetDisplayData | undefined {
  if (market.price == null) return undefined;

  const marketCap = market.marketCap;
  const change = getDadaPriceChangePercentage(market, range);
  const priceAtoms = new BigNumber(market.price).times(
    new BigNumber(10).pow(counterValueUnit.magnitude),
  );

  return {
    id: market.id ?? market.currencyId ?? currency?.id ?? asset.id,
    name: market.name ?? currency?.name ?? asset.name,
    ticker: market.ticker ?? currency?.ticker ?? asset.ticker,
    ledgerIds: currency ? [currency.id] : [],
    formattedMarketCap:
      marketCap == null
        ? "-"
        : counterValueFormatter({
            currency: counterCurrency,
            value: marketCap,
            shorten: true,
            locale,
            t,
          }),
    marketcapRank: market.marketCapRank ?? 0,
    formattedPrice: formatPrice(counterValueUnit, priceAtoms, { locale, showCode: true }),
    priceChangePercentage: typeof change === "number" && Number.isFinite(change) ? change : 0,
  };
}

function getDadaPriceChangePercentage(
  market: PartialMarketItemResponse,
  range: KeysPriceChange,
): number | undefined {
  switch (range) {
    case KeysPriceChange.hour:
      return market.priceChangePercentage1h;
    case KeysPriceChange.day:
      return market.priceChangePercentage24h;
    case KeysPriceChange.week:
      return market.priceChangePercentage7d;
    case KeysPriceChange.month:
      return market.priceChangePercentage30d;
    case KeysPriceChange.year:
      return market.priceChangePercentage1y;
  }
}
