import { useMemo } from "react";
import { useAssetsData } from "@ledgerhq/live-common/dada-client/hooks/useAssetsData";
import { useStablecoinTickers } from "@ledgerhq/live-common/dada-client/hooks/useStablecoinTickers";
import { useUsdToFiatRate } from "@ledgerhq/live-common/counterValues/hooks/useUsdToFiatRate";
import { MarketCurrencyData } from "@ledgerhq/live-common/market/utils/types";
import { useSelector } from "LLD/hooks/redux";
import { counterValueCurrencySelector } from "~/renderer/reducers/settings";
import { mapAssetsDataToMarketCurrencies } from "../utils/mapAssetsDataToMarketCurrencies";
import { AssetSuggestionsViewModelResult } from "../types";

export function useAssetSuggestionsViewModel({
  cryptosLimit,
  stablecoinsLimit,
}: {
  cryptosLimit: number;
  stablecoinsLimit: number;
}): AssetSuggestionsViewModelResult {
  const counterCurrency = useSelector(counterValueCurrencySelector).ticker;

  const {
    data,
    isLoading: assetsLoading,
    isError: assetsError,
  } = useAssetsData({
    product: "lld",
    version: __APP_VERSION__,
  });

  const {
    tickers,
    isLoading: tickersLoading,
    isError: tickersError,
  } = useStablecoinTickers("lld", __APP_VERSION__);

  const { status: rateStatus, rate } = useUsdToFiatRate(counterCurrency);

  const hasData = !!data;
  const isLoading = assetsLoading || tickersLoading || (hasData && rateStatus === "loading");
  const isError = assetsError || tickersError || (hasData && rateStatus === "error");

  const { cryptos, stablecoins } = useMemo(() => {
    const cryptosData: MarketCurrencyData[] = [];
    const stablecoinsData: MarketCurrencyData[] = [];

    for (const currency of mapAssetsDataToMarketCurrencies(data, rate ?? 1)) {
      const isStablecoin = tickers.has(currency.ticker.toUpperCase());
      const [bucket, bucketLimit] = isStablecoin
        ? [stablecoinsData, stablecoinsLimit]
        : [cryptosData, cryptosLimit];
      if (bucket.length < bucketLimit) bucket.push(currency);
      if (cryptosData.length >= cryptosLimit && stablecoinsData.length >= stablecoinsLimit) break;
    }

    return { cryptos: cryptosData, stablecoins: stablecoinsData };
  }, [data, rate, tickers, cryptosLimit, stablecoinsLimit]);

  return useMemo(
    () => ({
      cryptos: { data: cryptos, isLoading },
      stablecoins: { data: stablecoins, isLoading },
      isError,
    }),
    [cryptos, stablecoins, isLoading, isError],
  );
}
