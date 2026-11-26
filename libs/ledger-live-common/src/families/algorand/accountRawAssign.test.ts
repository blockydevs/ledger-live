import type { OperationExtraRaw } from "@ledgerhq/types-live";
import BigNumber from "bignumber.js";
import { getAccountRawAssignHooks } from "../../bridge/generic-coin-framework/accountRawAssign";

describe("algorand accountRawAssign", () => {
  it("revives the rewards of a legacy operation as a BigNumber and keeps the other keys", async () => {
    const hooks = await getAccountRawAssignHooks("algorand");
    const extraRaw = { memo: "hello", rewards: "1500", assetReference: "31566704" };

    const extra = hooks.fromOperationExtraRaw?.(extraRaw as OperationExtraRaw);

    expect(extra).toEqual({
      rewards: new BigNumber(1500),
      memo: "hello",
      assetReference: "31566704",
    });
    expect(hooks.toOperationExtraRaw?.(extra)).toEqual(extraRaw);
  });
});
