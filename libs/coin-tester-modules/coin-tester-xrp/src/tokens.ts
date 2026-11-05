import BigNumber from "bignumber.js";
import { setCryptoAssetsStore } from "@ledgerhq/ledger-wallet-framework/cryptoAssetsStore";
import type { TokenCurrency } from "@ledgerhq/ledger-wallet-framework/types";
import {
  CryptoCurrencyIdSchema,
  TokenCurrencyIdSchema,
} from "@ledgerhq/ledger-wallet-framework/types";
import { XRP } from "./fixtures";

/** coin-xrp scales every IOU amount by 1e38 (`IOU_DECIMALS`). */
export const IOU_MAGNITUDE = 38;

const NETWORK = XRP.id;

export function iouAmount(value: string): BigNumber {
  return new BigNumber(value).shiftedBy(IOU_MAGNITUDE);
}

/** The 40-hex form of an XRPL currency code, lowercase. A 3-character code sits at bytes 12–14. */
function toCurrencyHex(code: string): string {
  if (code.length !== 3) return code.toLowerCase();
  const ascii = Buffer.from(code, "ascii").toString("hex");

  return "00".repeat(12) + ascii + "00".repeat(5);
}

/**
 * A CAL entry for an IOU. `code` is the canonical currency coin-xrp reports: a 3-character
 * code as written, case kept, or 40 uppercase hex characters.
 */
export function makeIouToken(code: string, issuer: string): TokenCurrency {
  return {
    type: "TokenCurrency",
    id: TokenCurrencyIdSchema.parse(
      `${NETWORK}/iou/${toCurrencyHex(code)}:${issuer.toLowerCase()}`,
    ),
    contractAddress: issuer,
    tokenIdentifier: code,
    parentCurrencyId: CryptoCurrencyIdSchema.parse(NETWORK),
    tokenType: "iou",
    name: code,
    ticker: code,
    delisted: false,
    disableCountervalue: true,
    units: [{ name: code, code, magnitude: IOU_MAGNITUDE }],
  };
}

/** A CAL entry for an MPT issuance. Its magnitude is the issuance `AssetScale`. */
export function makeMptToken(
  issuanceId: string,
  issuer: string,
  ticker: string,
  assetScale: number,
): TokenCurrency {
  return {
    type: "TokenCurrency",
    id: TokenCurrencyIdSchema.parse(
      `${NETWORK}/mpt/${issuanceId.toLowerCase()}:${issuer.toLowerCase()}`,
    ),
    contractAddress: issuer,
    tokenIdentifier: issuanceId,
    parentCurrencyId: CryptoCurrencyIdSchema.parse(NETWORK),
    tokenType: "mpt",
    name: ticker,
    ticker,
    delisted: false,
    disableCountervalue: true,
    units: [{ name: ticker, code: ticker, magnitude: assetScale }],
  };
}

/**
 * Replaces the crypto-assets store with a stub that knows only `tokens`. A lookup returns a
 * token only when network, issuer and reference are equal to its own, case included.
 */
export function installTokenStore(tokens: TokenCurrency[]): void {
  setCryptoAssetsStore({
    findTokenByAddressInCurrency: async (address, currencyId, tokenIdentifier) =>
      tokens.find(
        token =>
          token.parentCurrencyId === currencyId &&
          token.contractAddress === address &&
          token.tokenIdentifier === tokenIdentifier,
      ),
    findTokenById: async (id: string) => tokens.find(token => token.id === id),
    getTokensSyncHash: async () => "",
  });
}
