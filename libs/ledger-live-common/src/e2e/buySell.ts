import { getAmountFromUSD } from "./currencyUtils";
import { sanitizeError } from "./index";
import axios, { AxiosRequestConfig } from "axios";

const BUY_SELL_BASE_URL = "https://buy.api.aws.prd.ldg-tech.com";
const SELL_CRYPTO_LIMITATION_ENDPOINT = "/sell/v1/cryptoLimitations";
const FALLBACK_TARGET_USD = 10;

type CryptoLimitation = {
  min: string;
  maxOfMin: string;
  minOfMax: string;
  maxOfMax: string;
};

type CryptoLimitationsResponse = {
  value?: Record<string, CryptoLimitation>;
};

/**
 * Returns the minimum amount to sell `currencyId`, formatted as an input-ready string.
 *
 * Formatting (trim to 6 decimals, drop trailing zeros) lives here so every consumer
 * (desktop + mobile E2E) enters the exact same value — avoiding the per-POM drift the
 * swap helpers suffer from (desktop rounds to 6dp, mobile uses full precision).
 *
 * @throws if the minimum cannot be determined from the API or the countervalues fallback.
 */
export async function getMinimumSellAmount(currencyId: string): Promise<string> {
  const amount = await fetchMinimumSellAmount(currencyId);
  if (amount === null) {
    throw new Error(`Could not determine minimum sell amount for "${currencyId}"`);
  }
  return Number.parseFloat(amount.toFixed(6)).toString();
}

async function fetchMinimumSellAmount(currencyId: string): Promise<number | null> {
  try {
    const requestConfig: AxiosRequestConfig = {
      method: "GET",
      url: BUY_SELL_BASE_URL + SELL_CRYPTO_LIMITATION_ENDPOINT,
      headers: { accept: "application/json" },
    };

    const { data } = await axios<CryptoLimitationsResponse>(requestConfig);

    const rawMaxOfMin = data?.value?.[currencyId]?.maxOfMin;
    const maxOfMin = rawMaxOfMin !== undefined ? Number.parseFloat(rawMaxOfMin) : Number.NaN;

    if (!Number.isNaN(maxOfMin) && maxOfMin > 0) {
      return maxOfMin;
    }

    console.warn(
      `No sell limitation found for "${currencyId}", ` +
        `computing fallback from countervalues (~$${FALLBACK_TARGET_USD} USD)`,
    );
    return await getAmountFromUSD(currencyId, FALLBACK_TARGET_USD);
  } catch (error: unknown) {
    const sanitizedError = sanitizeError(error);
    console.warn("Error fetching sell minimum amount:", sanitizedError);

    // Last resort: try to compute a sensible amount even if the limitations call failed entirely.
    try {
      return await getAmountFromUSD(currencyId, FALLBACK_TARGET_USD);
    } catch {
      return null;
    }
  }
}
