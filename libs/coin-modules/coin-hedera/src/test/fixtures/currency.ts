import type { CryptoCurrency, TokenCurrency } from "@ledgerhq/types-cryptoassets";

export const getMockedCurrency = (overrides?: Partial<CryptoCurrency>): CryptoCurrency => {
  return {
    type: "CryptoCurrency",
    id: "hedera",
    managerAppName: "Hedera",
    coinType: 3030,
    scheme: "hedera",
    color: "#000",
    family: "hedera",
    explorerViews: [
      {
        tx: "https://hashscan.io/mainnet/transaction/$hash",
        address: "https://hashscan.io/mainnet/account/$address",
      },
    ],
    name: "Hedera",
    ticker: "HBAR",
    units: [
      {
        name: "HBAR",
        code: "HBAR",
        magnitude: 8,
      },
    ],
    ...overrides,
  };
};

export const getMockedTokenCurrency = (overrides?: Partial<TokenCurrency>): TokenCurrency => {
  return {
    id: "hedera/hts/test_0.0.1001",
    contractAddress: "0.0.1001",
    parentCurrency: getMockedCurrency(),
    tokenType: "hts",
    name: "Test token",
    ticker: "TEST",
    type: "TokenCurrency",
    units: [
      {
        name: "Test",
        code: "TEST",
        magnitude: 8,
      },
    ],
    ...overrides,
  };
};
