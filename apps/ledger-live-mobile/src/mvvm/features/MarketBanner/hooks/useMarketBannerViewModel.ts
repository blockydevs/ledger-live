import { useCallback, useMemo } from "react";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  MarketItemPerformer,
  filterMarketPerformersByAvailability,
} from "@ledgerhq/live-common/market/utils/index";
import { useRampCatalog } from "@ledgerhq/live-common/platform/providers/RampCatalogProvider/useRampCatalog";
import { useFetchCurrencyAll } from "@ledgerhq/live-common/exchange/swap/hooks/index";
import { track } from "~/analytics";
import { ScreenName } from "~/const";
import { BaseNavigatorStackParamList } from "~/components/RootNavigator/types/BaseNavigator";
import { useAssetDetailNavigation } from "LLM/features/AssetDetail/hooks/useAssetDetailNavigation";
import { MARKET_BANNER_TILE_COUNT, PAGE_NAME, BANNER_NAME } from "../constants";
import { UseMarketBannerViewModelResult } from "../types";
import { useMarketBannerFilter } from "./useMarketBannerFilter";
import { useMarketBannerData } from "./useMarketBannerData";
import { useWalletFeaturesConfig } from "@features/platform-feature-flags";
import { TIME_RANGE } from "@ledgerhq/live-common/market/constants";

const useMarketBannerViewModel = (): UseMarketBannerViewModelResult => {
  const baseNavigation = useNavigation<NativeStackNavigationProp<BaseNavigatorStackParamList>>();
  const { shouldDisplayAssetDiscoverability } = useWalletFeaturesConfig("mobile");
  const { openFromMarket } = useAssetDetailNavigation();
  const bannerFilter = useMarketBannerFilter();

  const { isCurrencyAvailable } = useRampCatalog();
  const { data: currenciesForSwapAll } = useFetchCurrencyAll();

  const currenciesForSwapAllSet = useMemo(
    () => new Set(currenciesForSwapAll ?? []),
    [currenciesForSwapAll],
  );

  const { data, isLoading, isError } = useMarketBannerData(bannerFilter.filter);

  const filteredItems = useMemo(
    () =>
      filterMarketPerformersByAvailability(
        data,
        isCurrencyAvailable,
        currenciesForSwapAllSet,
        MARKET_BANNER_TILE_COUNT,
      ),
    [data, isCurrencyAvailable, currenciesForSwapAllSet],
  );

  const navigateToMarket = useCallback(() => {
    baseNavigation.navigate(ScreenName.MarketList);
  }, [baseNavigation]);

  const onTilePress = useCallback(
    (item: MarketItemPerformer) => {
      track("button_clicked", {
        button: "Market Tile",
        page: PAGE_NAME,
        coin: item.name,
        banner: BANNER_NAME,
      });
      openFromMarket({
        marketCurrencyId: item.id,
        ledgerCurrencyIds: item.ledgerIds,
        source: "market_banner",
      });
    },
    [openFromMarket],
  );

  const onViewAllPress = useCallback(() => {
    track("button_clicked", {
      button: "View All",
      page: PAGE_NAME,
      banner: BANNER_NAME,
    });
    navigateToMarket();
  }, [navigateToMarket]);

  const onSectionTitlePress = useCallback(() => {
    track("button_clicked", {
      button: "Section Title",
      page: PAGE_NAME,
      banner: BANNER_NAME,
    });
    navigateToMarket();
  }, [navigateToMarket]);

  return {
    items: filteredItems,
    isLoading,
    isError,
    showFilter: shouldDisplayAssetDiscoverability,
    bannerFilter,
    range: TIME_RANGE,
    onTilePress,
    onViewAllPress,
    onSectionTitlePress,
  };
};

export default useMarketBannerViewModel;
