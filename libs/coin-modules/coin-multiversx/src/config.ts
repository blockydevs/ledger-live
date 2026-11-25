import buildCoinConfig, {
  type CoinConfig,
  type Context,
  type CurrencyConfig,
} from "@ledgerhq/coin-module-framework/config";

export type MultiversXConfig = {
  apiEndpoint: string;
  delegationApiEndpoint: string;
};

export type MultiversXCoinConfig = CurrencyConfig & MultiversXConfig;

/** The {@link Context} threaded through the coin-multiversx Alpaca api layer (ADR-019). */
export type MultiversXContext = Context<MultiversXCoinConfig>;

const coinConfig: {
  setCoinConfig: (config: CoinConfig<MultiversXCoinConfig>) => void;
  getCoinConfig: (currencyId?: string) => MultiversXCoinConfig;
} = buildCoinConfig<MultiversXCoinConfig>();

export default coinConfig;

// Backward-compatible named exports used by the bridge path.
export const setCoinConfig = coinConfig.setCoinConfig.bind(coinConfig);
export const getCoinConfig = coinConfig.getCoinConfig.bind(coinConfig);

// Keyed by currency id (`config_currency_elrond`); the legacy bridge reads its endpoints from env vars.
export const multiversxDefaults = {
  elrond: {
    apiEndpoint: "https://elrond.coin.ledger.com",
    delegationApiEndpoint: "https://delegations-elrond.coin.ledger.com",
    status: {
      type: "active",
      features: [
        { id: "blockchain_txs", status: "active" },
        { id: "staking_txs", status: "active" },
      ],
    },
    name: "MultiversX",
    unit: { name: "EGLD", code: "EGLD", magnitude: 18 },
  },
} satisfies Record<string, CurrencyConfig & Partial<MultiversXCoinConfig>>;
