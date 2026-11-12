import type { Account, AccountLike } from "@ledgerhq/types-live";
import { getXrpEnabledTokenStandards } from "@ledgerhq/live-common/families/xrp/config";
import type { XrpTokenAccount, XrpTokenResources } from "@ledgerhq/live-common/families/xrp/types";
import BigNumber from "bignumber.js";
import type { Unit } from "@domain/entity-currency-unit";
import { isMaxTrustLimitValue } from "@ledgerhq/live-common/families/xrp/logicPublic";

export const hasTokenStandardEnabled = (account: Account): boolean => {
  return getXrpEnabledTokenStandards(account.currency.id).length > 0;
};

export const getXrpResources = (
  account: AccountLike | undefined,
): XrpTokenResources | undefined => {
  if (account?.type !== "TokenAccount") return undefined;

  return (account as XrpTokenAccount).xrpResources;
};

const MANTISSA_DECIMALS = 2;

// An IOU amount holds 16 significant digits: every digit after them is a 0
const MAX_PLAIN_INTEGER_DIGITS = 16;

type ScientificParts = {
  /** In the notation of the locale: "9.99" */
  mantissa: string;
  /** The power of 10: "95", "-4" */
  exponent: string;
};

/** The parts of "9.99 × 10⁹⁵". The mantissa rounds down: the result never exceeds the value. */
export function toScientificParts(value: BigNumber, locale: string): ScientificParts {
  const scientific = value.toExponential(MANTISSA_DECIMALS, BigNumber.ROUND_DOWN);

  const [mantissa, exponent] = scientific.split("e");

  const numberFormat = new Intl.NumberFormat(locale, {
    minimumFractionDigits: MANTISSA_DECIMALS,
    maximumFractionDigits: MANTISSA_DECIMALS,
  });

  return { mantissa: numberFormat.format(Number(mantissa)), exponent: exponent.replace("+", "") };
}

/** "9.99e95" */
export function toScientificNotation(value: BigNumber, locale: string): string {
  const { mantissa, exponent } = toScientificParts(value, locale);

  return `${mantissa}e${exponent}`;
}

/** "9.999999999999998e95": every significant digit of the value */
function toExactScientificNotation(value: BigNumber, locale: string): string {
  const [mantissa, exponent] = value.toExponential().split("e");

  const numberParts = new Intl.NumberFormat(locale).formatToParts(1.1);

  const decimalSeparator = numberParts.find(part => part.type === "decimal")?.value ?? ".";

  return `${mantissa.replace(".", decimalSeparator)}e${exponent.replace("+", "")}`;
}

/**
 * A trust limit, in the token's base units, that is too long for the plain notation:
 * "9.99e95 USD" at the protocol maximum, "1.5e20 USD" above 16 integer digits. Null for a shorter limit.
 */
export function formatLongTrustLimit(limit: BigNumber, unit: Unit, locale: string): string | null {
  const value = limit.shiftedBy(-unit.magnitude);

  if (isMaxTrustLimitValue(limit)) {
    return `${toScientificNotation(value, locale)} ${unit.code}`;
  }

  if (value.e !== null && value.e >= MAX_PLAIN_INTEGER_DIGITS) {
    return `${toExactScientificNotation(value, locale)} ${unit.code}`;
  }

  return null;
}
