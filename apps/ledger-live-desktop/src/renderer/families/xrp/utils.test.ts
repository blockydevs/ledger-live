import BigNumber from "bignumber.js";
import {
  formatLongTrustLimit,
  getXrpResources,
  toScientificNotation,
  toScientificParts,
} from "./utils";
import {
  XRP_ACCOUNT,
  XRP_IOU_TOKEN_ACCOUNT,
  XRP_REMOVED_TOKEN_ACCOUNT,
  XRP_TOKEN,
} from "./__mocks__/account.mock";

const unit = XRP_TOKEN.units[0];

describe("getXrpResources", () => {
  it("reads the resources of a held token", () => {
    expect(getXrpResources(XRP_IOU_TOKEN_ACCOUNT)).toBe(XRP_IOU_TOKEN_ACCOUNT.xrpResources);
  });

  it("has none for a removed token", () => {
    expect(getXrpResources(XRP_REMOVED_TOKEN_ACCOUNT)).toBeUndefined();
  });

  it("has none for the XRP account or no account", () => {
    expect(getXrpResources(XRP_ACCOUNT)).toBeUndefined();
    expect(getXrpResources(undefined)).toBeUndefined();
  });
});

function toBaseUnits(value: string): BigNumber {
  return new BigNumber(value).shiftedBy(unit.magnitude);
}

describe("toScientificParts", () => {
  it("should round the mantissa down", () => {
    expect(toScientificParts(new BigNumber("9999999999999999e80"), "en-US")).toEqual({
      mantissa: "9.99",
      exponent: "95",
    });
  });

  it("should use the decimal separator of the locale", () => {
    expect(toScientificParts(new BigNumber("1500"), "fr-FR")).toEqual({
      mantissa: "1,50",
      exponent: "3",
    });
  });

  it("should keep the sign of a negative exponent", () => {
    expect(toScientificParts(new BigNumber("0.00012"), "en-US")).toEqual({
      mantissa: "1.20",
      exponent: "-4",
    });
  });
});

describe("toScientificNotation", () => {
  it("should join the mantissa and the exponent with e", () => {
    expect(toScientificNotation(new BigNumber("9999999999999999e80"), "en-US")).toBe("9.99e95");
  });
});

describe("formatLongTrustLimit", () => {
  it("should round the protocol maximum to 2 decimals", () => {
    expect(formatLongTrustLimit(toBaseUnits("9999999999999999e80"), unit, "en-US")).toBe(
      `9.99e95 ${unit.code}`,
    );
  });

  it("should keep every significant digit of a limit above 16 integer digits", () => {
    expect(formatLongTrustLimit(toBaseUnits("9999999999999999e79"), unit, "en-US")).toBe(
      `9.999999999999999e94 ${unit.code}`,
    );
  });

  it("should use the decimal separator of the locale", () => {
    expect(formatLongTrustLimit(toBaseUnits("15e19"), unit, "fr-FR")).toBe(`1,5e20 ${unit.code}`);
  });

  it("should return null for a limit of 16 integer digits", () => {
    expect(formatLongTrustLimit(toBaseUnits("9999999999999999"), unit, "en-US")).toBeNull();
  });
});
