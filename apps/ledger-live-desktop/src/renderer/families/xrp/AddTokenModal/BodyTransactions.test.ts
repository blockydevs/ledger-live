import { BigNumber } from "bignumber.js";
import type { AccountBridge } from "@ledgerhq/types-live";
import { updateTransaction } from "@ledgerhq/ledger-wallet-framework/bridge/jsHelpers";
import type { Transaction } from "@ledgerhq/live-common/families/xrp/types";
import { XRP_ACCOUNT, makeXrpTokenAccount } from "../__mocks__/account.mock";
import { makeChangeTrustTransaction } from "./Body";

const limit = new BigNumber(1000).shiftedBy(38);

const bridge = {
  updateTransaction,
  createTransaction: () => ({ family: "xrp", amount: new BigNumber(0), recipient: "" }),
} as unknown as AccountBridge<Transaction>;

describe("makeChangeTrustTransaction", () => {
  it("should leave the rippling choice out of an opt-in", () => {
    const transaction = makeChangeTrustTransaction(bridge, XRP_ACCOUNT, undefined);

    expect(transaction.mode).toBe("changeTrust");
    expect(transaction).not.toHaveProperty("noRipple");
  });

  it.each([
    [true, false],
    [false, true],
    [undefined, true],
  ])("should resend isRippling %s on an edit as noRipple %s", (isRippling, noRipple) => {
    const tokenAccount = makeXrpTokenAccount({ limit, isRippling });
    const transaction = makeChangeTrustTransaction(bridge, XRP_ACCOUNT, tokenAccount);

    expect(transaction).toMatchObject({ mode: "changeTrust", amount: limit, noRipple });
  });
});
