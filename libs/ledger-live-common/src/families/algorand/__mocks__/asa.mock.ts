import type { TokenCurrency } from "@domain/entity-currency-token";

export const ASA_ID = "31566704";

export const asaToken = {
  type: "TokenCurrency",
  id: `algorand/asa/${ASA_ID}`,
  contractAddress: "2UEQTE5QDNXPI7M3TU44G6SYKLFWLPQO7EBZM7K7MHMQQMFI4QJPLHQFHM",
  parentCurrencyId: "algorand",
  tokenType: "asa",
  name: "USDC",
  ticker: "USDC",
  units: [{ name: "USDC", code: "USDC", magnitude: 6 }],
} as unknown as TokenCurrency;
