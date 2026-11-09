import { BigNumber } from "bignumber.js";
import { fromTransactionRaw, toTransactionRaw } from "./transaction";
import type { Transaction } from "./types";

const optIn: Transaction = {
  family: "xrp",
  mode: "changeTrust",
  assetReference: "USD",
  assetOwner: "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De",
  amount: new BigNumber(1),
  recipient: "",
  fees: null,
  networkInfo: null,
  tag: null,
};

describe("XRP transaction raw round trip", () => {
  it.each([false, true])("keeps noRipple %s", noRipple => {
    const revived = fromTransactionRaw(toTransactionRaw({ ...optIn, noRipple }));

    expect(revived.noRipple).toBe(noRipple);
  });

  it("leaves noRipple out when the transaction has none", () => {
    expect(fromTransactionRaw(toTransactionRaw(optIn))).not.toHaveProperty("noRipple");
  });
});
