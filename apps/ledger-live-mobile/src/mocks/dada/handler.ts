import { http, HttpResponse } from "msw";
import { mockData } from "@ledgerhq/live-common/modularDrawer/__mocks__/dada.mock";
import { mockStablecoinsResponse } from "@ledgerhq/live-common/dada-client/mocks/stablecoins.mock";

const STOCKS = [
  {
    id: "apple",
    ticker: "AAPL",
    name: "Apple",
    marketCap: 2_980_000_000_000,
    price: 203.35,
    priceChangePercentage24h: 1.24,
    marketCapRank: 1,
  },
  {
    id: "microsoft",
    ticker: "MSFT",
    name: "Microsoft",
    marketCap: 3_420_000_000_000,
    price: 459.11,
    priceChangePercentage24h: 0.82,
    marketCapRank: 2,
  },
  {
    id: "nvidia",
    ticker: "NVDA",
    name: "NVIDIA",
    marketCap: 3_010_000_000_000,
    price: 123.44,
    priceChangePercentage24h: -0.31,
    marketCapRank: 3,
  },
  {
    id: "tesla",
    ticker: "TSLA",
    name: "Tesla",
    marketCap: 1_120_000_000_000,
    price: 348.68,
    priceChangePercentage24h: 2.16,
    marketCapRank: 4,
  },
];

const mockStocksResponse = {
  cryptoAssets: Object.fromEntries(
    STOCKS.map(stock => [
      stock.id,
      {
        id: stock.id,
        ticker: stock.ticker,
        name: stock.name,
        assetsIds: {},
      },
    ]),
  ),
  networks: {},
  cryptoOrTokenCurrencies: {},
  interestRates: {},
  markets: Object.fromEntries(
    STOCKS.map(stock => [
      stock.id,
      {
        currencyId: stock.id,
        ticker: stock.ticker,
        name: stock.name,
        marketCap: stock.marketCap,
        totalVolume: 0,
        price: stock.price,
        priceChangePercentage1h: stock.priceChangePercentage24h,
        priceChangePercentage24h: stock.priceChangePercentage24h,
        priceChangePercentage7d: stock.priceChangePercentage24h,
        priceChangePercentage30d: stock.priceChangePercentage24h,
        priceChangePercentage1y: stock.priceChangePercentage24h,
        marketCapRank: stock.marketCapRank,
      },
    ]),
  ),
  currenciesOrder: {
    key: "marketCap",
    order: "desc",
    metaCurrencyIds: STOCKS.map(stock => stock.id),
  },
};

const handler = ({ request }: { request: Request }) => {
  const searchParams = new URL(request.url).searchParams;
  const categories = searchParams.get("categories");
  const categorySet = new Set(categories?.split(",").map(category => category.trim()));

  if (categorySet.has("stablecoins")) return HttpResponse.json(mockStablecoinsResponse);
  if (categorySet.has("stocks")) return HttpResponse.json(mockStocksResponse);

  const search = searchParams.get("search")?.toLowerCase().trim();

  if (search) {
    const filteredEntries = Object.entries(mockData.cryptoAssets).filter(([, asset]) => {
      const name = asset.name?.toLowerCase() ?? "";
      const ticker = asset.ticker?.toLowerCase() ?? "";
      return name.includes(search) || ticker.includes(search);
    });

    const matchingMetaCurrencyIds = filteredEntries.map(([id]) => id);
    const filteredCryptoAssets = Object.fromEntries(filteredEntries);
    const response = {
      ...mockData,
      cryptoAssets: filteredCryptoAssets,
      currenciesOrder: {
        ...mockData.currenciesOrder,
        metaCurrencyIds: matchingMetaCurrencyIds,
      },
    };
    return HttpResponse.json(response);
  }

  return HttpResponse.json(mockData);
};

const handlers = [
  http.get("https://dada.api.ledger-test.com/v1/assets", handler),
  http.get("https://dada.api.ledger.com/v1/assets", handler),
];

export default handlers;
