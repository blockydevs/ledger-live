import { log } from "@ledgerhq/logs";
import { utils as TyphonUtils, address as TyphonAddress } from "@stricahq/typhonjs";

/**
 * Safely converts a value to BigInt, returning 0n if conversion fails.
 * Prevents crashes from malformed API data (NaN, undefined, empty strings, null).
 */
export function safeBigInt(value: unknown): bigint {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") {
    return 0n;
  }
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

/**
 * Safely converts a timestamp to Date, returning epoch (1970-01-01) if invalid.
 * Prevents Invalid Date objects from malformed API data.
 */
export function safeDate(timestamp: unknown): Date {
  const date = new Date(
    typeof timestamp === "number" || typeof timestamp === "string" ? timestamp : 0,
  );
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

// Empty credential key used for unsupported address types (Byron, unknown)
export const EMPTY_CREDENTIAL_KEY =
  "0000000000000000000000000000000000000000000000000000000000000000";

/**
 * Normalizes a Cardano address from hex to bech32 format if needed.
 * Returns the address as-is if it's already bech32 (or can't be decoded as hex).
 */
export function normalizeAddress(address: string, isHexString: (s: string) => boolean): string {
  // An odd-length hex string would be silently truncated by Buffer.from(..., "hex"),
  // yielding a wrong address instead of failing — require an even length before decoding.
  if (isHexString(address) && address.length % 2 === 0) {
    try {
      return TyphonUtils.getAddressFromHex(Buffer.from(address, "hex")).getBech32();
    } catch (error) {
      log("cardano/utils", "Failed to normalize hex address", {
        address,
        error: error instanceof Error ? error.message : String(error),
      });
      return address;
    }
  }
  return address;
}

/**
 * Extract payment credential key hash from a Cardano address.
 * Supports Base, Enterprise, and Pointer addresses (Shelley era).
 * Reward (stake) addresses have no payment credential, and Byron / invalid
 * addresses cannot be parsed — all return the empty credential key, which the
 * caller treats as "no operations".
 */
export function extractPaymentKeyFromAddress(address: string): string {
  try {
    const cardanoAddress = TyphonUtils.getAddressFromString(address);

    if (
      cardanoAddress instanceof TyphonAddress.BaseAddress ||
      cardanoAddress instanceof TyphonAddress.EnterpriseAddress ||
      cardanoAddress instanceof TyphonAddress.PointerAddress
    ) {
      return cardanoAddress.paymentCredential.hash.toString("hex");
    }

    log("cardano/utils", "Unsupported address type", {
      address,
      addressType: cardanoAddress.constructor.name,
      isByron: cardanoAddress instanceof TyphonAddress.ByronAddress,
    });

    return EMPTY_CREDENTIAL_KEY;
  } catch (error) {
    log("cardano/utils", "Failed to parse Cardano address", {
      address,
      error: error instanceof Error ? error.message : String(error),
    });
    return EMPTY_CREDENTIAL_KEY;
  }
}

/**
 * Extract stake credential key hash from a Cardano address.
 * Only Base and Reward addresses have stake credentials.
 * Returns undefined for Enterprise, Pointer, Byron, or invalid addresses.
 */
export function extractStakeKeyFromAddress(address: string): string | undefined {
  try {
    const cardanoAddress = TyphonUtils.getAddressFromString(address);

    if (cardanoAddress instanceof TyphonAddress.BaseAddress) {
      return cardanoAddress.stakeCredential.hash.toString("hex");
    }

    if (cardanoAddress instanceof TyphonAddress.RewardAddress) {
      return cardanoAddress.stakeCredential.hash.toString("hex");
    }

    return undefined;
  } catch (error) {
    log("cardano/utils", "Failed to extract stake key from address", {
      address,
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}
