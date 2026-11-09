import { BigNumber } from "bignumber.js";
import type { TokenCurrency } from "@domain/entity-currency-token";
import { MAX_TRUST_LIMIT, getIssuerFee, isMaxTrustLimit } from "@ledgerhq/coin-xrp/logic-public";
import { buildContext } from "../../bridge/generic-coin-framework/api/context";

// Encapsulate for LLD et LLM
export * from "@ledgerhq/coin-xrp/logic-public";

/** Max, the trust limit an IOU opt-in prefills, in the token's base units */
export const MAX_TRUST_LIMIT_VALUE = new BigNumber(MAX_TRUST_LIMIT.toString());

/** Whether a trust limit, in the token's base units, is the protocol maximum */
export const isMaxTrustLimitValue = (limit: BigNumber): boolean => {
  return limit.isInteger() && isMaxTrustLimit(BigInt(limit.toFixed()));
};

/** The issuer's fee on each transfer between holders, as a percentage: "0.5" for 0.5% */
export const getIssuerFeeForToken = async (token: TokenCurrency): Promise<string> => {
  const asset = {
    type: token.tokenType,
    assetReference: token.tokenIdentifier,
    assetOwner: token.contractAddress,
  };

  return getIssuerFee(buildContext(token.parentCurrencyId), asset);
};
