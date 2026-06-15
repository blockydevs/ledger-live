import { useMemo } from "react";
import { useAssetsData } from "@ledgerhq/live-common/dada-client/hooks/useAssetsData";
import { useUsdToFiatRate } from "@ledgerhq/live-common/counterValues/hooks/useUsdToFiatRate";
import { MarketCurrencyData } from "@ledgerhq/live-common/market/utils/types";
import { useSelector } from "LLD/hooks/redux";
import { counterValueCurrencySelector } from "~/renderer/reducers/settings";
import { mapAssetsDataToMarketCurrencies } from "../utils/mapAssetsDataToMarketCurrencies";

type Params = {
  search?: string;
  skip?: boolean;
  limit?: number;
};

type Result = {
  data: MarketCurrencyData[];
  isLoading: boolean;
  isError: boolean;
  loadNext?: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
};

export function useAssetSearchResultsViewModel({ search, skip, limit }: Params): Result {
  const counterCurrency = useSelector(counterValueCurrencySelector).ticker;

  const { data, isLoading, isError, loadNext, isFetchingNextPage } = useAssetsData({
    product: "lld",
    version: __APP_VERSION__,
    search,
    skip,
  });

  const { status: rateStatus, rate } = useUsdToFiatRate(counterCurrency);

  const results = useMemo<MarketCurrencyData[]>(() => {
    const mapped = mapAssetsDataToMarketCurrencies(data, rate ?? 1);
    return limit === undefined ? mapped : mapped.slice(0, limit);
  }, [data, rate, limit]);

  const hasData = !!data;

  return useMemo(
    () => ({
      data: results,
      isLoading: isLoading || (hasData && rateStatus === "loading"),
      isError: isError || (hasData && rateStatus === "error"),
      loadNext,
      hasNextPage: !!loadNext,
      isFetchingNextPage,
    }),
    [results, isLoading, isError, hasData, rateStatus, loadNext, isFetchingNextPage],
  );
}
