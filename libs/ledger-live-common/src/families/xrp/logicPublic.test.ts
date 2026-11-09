import { BigNumber } from "bignumber.js";
import { MAX_TRUST_LIMIT_VALUE, isMaxTrustLimitValue } from "./logicPublic";

const PROTOCOL_MAX = new BigNumber("9999999999999999e80").shiftedBy(38);

describe("MAX_TRUST_LIMIT_VALUE", () => {
  it("is the protocol maximum in base units", () => {
    expect(MAX_TRUST_LIMIT_VALUE).toEqual(PROTOCOL_MAX);
  });
});

describe("isMaxTrustLimitValue", () => {
  it("is true for the protocol maximum in base units", () => {
    expect(isMaxTrustLimitValue(PROTOCOL_MAX)).toBe(true);
  });

  it.each([PROTOCOL_MAX.minus(1), new BigNumber(1e9).shiftedBy(38), new BigNumber(0.5)])(
    "is false for %s",
    limit => {
      expect(isMaxTrustLimitValue(limit)).toBe(false);
    },
  );
});
