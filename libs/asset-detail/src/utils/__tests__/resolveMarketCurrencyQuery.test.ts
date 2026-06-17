import {
  getMarketLedgerIdsForQuery,
  isCoingeckoStyleMarketId,
  MAX_MARKET_LEDGER_IDS,
  resolveCoingeckoIdForIdsQuery,
  shouldFetchMarketByLedgerIds,
} from "../resolveMarketCurrencyQuery";

describe("isCoingeckoStyleMarketId", () => {
  it("returns true for plain market slugs", () => {
    expect(isCoingeckoStyleMarketId("shiba-inu")).toBe(true);
    expect(isCoingeckoStyleMarketId("bitcoin")).toBe(true);
  });

  it("returns false for ledger ids and DADA urns", () => {
    expect(isCoingeckoStyleMarketId("ethereum/erc20/shiba_inu")).toBe(false);
    expect(isCoingeckoStyleMarketId("urn:crypto:meta-currency:shiba_inu")).toBe(false);
  });
});

describe("resolveCoingeckoIdForIdsQuery", () => {
  it("returns coingecko ids as-is", () => {
    expect(resolveCoingeckoIdForIdsQuery("shiba-inu")).toBe("shiba-inu");
  });

  it("converts DADA urns to coingecko slugs for the legacy ids filter", () => {
    expect(resolveCoingeckoIdForIdsQuery("urn:crypto:meta-currency:shiba_inu")).toBe("shiba-inu");
  });

  it("returns undefined for ledger ids that cannot be mapped to a coingecko slug", () => {
    expect(resolveCoingeckoIdForIdsQuery("ethereum/erc20/shiba_inu")).toBeUndefined();
    expect(resolveCoingeckoIdForIdsQuery("solana/spl/bonk")).toBeUndefined();
  });
});

describe("shouldFetchMarketByLedgerIds", () => {
  it("returns false when no ledger ids are known", () => {
    expect(shouldFetchMarketByLedgerIds("shiba-inu", undefined)).toBe(false);
    expect(shouldFetchMarketByLedgerIds("shiba-inu", [])).toBe(false);
  });

  it("returns true when the market api id is missing", () => {
    expect(shouldFetchMarketByLedgerIds(undefined, ["solana/spl/bonk"])).toBe(true);
  });

  it("returns true when the market api id is a ledger id", () => {
    expect(
      shouldFetchMarketByLedgerIds("ethereum/erc20/shiba_inu", ["ethereum/erc20/shiba_inu"]),
    ).toBe(true);
    expect(shouldFetchMarketByLedgerIds("solana/spl/bonk", ["solana/spl/bonk"])).toBe(true);
  });

  it("returns false when a coingecko id can be queried via ids (legacy / v3 filter)", () => {
    expect(shouldFetchMarketByLedgerIds("shiba-inu", ["ethereum/erc20/shiba_inu"])).toBe(false);
    expect(shouldFetchMarketByLedgerIds("bitcoin", ["bitcoin"])).toBe(false);
  });

  it("returns false for DADA urns that convert to a coingecko slug (backward compatible)", () => {
    expect(
      shouldFetchMarketByLedgerIds("urn:crypto:meta-currency:bonk", ["solana/spl/bonk"]),
    ).toBe(false);
  });
});

describe("getMarketLedgerIdsForQuery", () => {
  it("caps the number of ledger ids sent in the query string", () => {
    const ledgerIds = Array.from({ length: MAX_MARKET_LEDGER_IDS + 3 }, (_, index) => `id-${index}`);
    expect(getMarketLedgerIdsForQuery(ledgerIds)).toHaveLength(MAX_MARKET_LEDGER_IDS);
    expect(getMarketLedgerIdsForQuery(ledgerIds)[0]).toBe("id-0");
  });
});
