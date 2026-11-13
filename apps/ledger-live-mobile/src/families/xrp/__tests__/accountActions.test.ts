import BigNumber from "bignumber.js";
import type { Account } from "@ledgerhq/types-live";
import type { XrpTokenAccount } from "@ledgerhq/live-common/families/xrp/types";
import { getXrpEnabledTokenStandards } from "@ledgerhq/live-common/families/xrp/config";
import { genTokenAccount } from "@ledgerhq/ledger-wallet-framework/mocks/account";
import { NavigatorName, ScreenName } from "~/const";
import accountActions, { RemovalPendingDrawer, TokenFrozenDrawer } from "../accountActions";
import { XRP_ACCOUNT, makePendingOptOut } from "../__mocks__/account.mock";
import { xrpIouToken, xrpMptToken } from "../__mocks__/currency.mock";

jest.mock("@ledgerhq/live-common/families/xrp/config", () => {
  return {
    ...jest.requireActual("@ledgerhq/live-common/families/xrp/config"),
    getXrpEnabledTokenStandards: jest.fn(),
  };
});

function makeTokenAccount(
  token: typeof xrpIouToken,
  xrpResources: XrpTokenAccount["xrpResources"] = { isLocked: false },
): XrpTokenAccount {
  return {
    ...genTokenAccount(0, XRP_ACCOUNT, token),
    balance: new BigNumber(0),
    xrpResources,
  };
}

function getRemoveAction(account: XrpTokenAccount, parentAccount: Account = XRP_ACCOUNT) {
  return accountActions
    .getMainActions({ account, parentAccount })
    .find(action => action.id === "xrp-remove-token");
}

describe("xrp getMainActions", () => {
  beforeEach(() => {
    jest.mocked(getXrpEnabledTokenStandards).mockReturnValue(["iou", "mpt"]);
  });

  it.each([xrpIouToken, xrpMptToken])("offers to remove an empty $tokenType token", token => {
    const tokenAccount = makeTokenAccount(token);
    const action = getRemoveAction(tokenAccount);

    expect(action).toMatchObject({
      disabled: false,
      navigationParams: [
        NavigatorName.XrpRemoveTokenFlow,
        {
          screen: ScreenName.XrpRemoveTokenReview,
          params: { accountId: tokenAccount.id, parentId: XRP_ACCOUNT.id, token },
        },
      ],
    });
    expect(action).not.toHaveProperty("modalOnDisabledClick");
    expect(action?.label).toMatchObject({ props: { i18nKey: "xrp.removeToken.cta" } });
  });

  it("offers nothing on the XRP account itself", () => {
    expect(accountActions.getMainActions({ account: XRP_ACCOUNT })).toEqual([]);
  });

  it("offers nothing for a token account without its resources", () => {
    const { xrpResources: _removed, ...removedToken } = makeTokenAccount(xrpIouToken);

    expect(getRemoveAction(removedToken)).toBeUndefined();
  });

  it("offers nothing for a token of a standard that is not enabled", () => {
    jest.mocked(getXrpEnabledTokenStandards).mockReturnValue(["iou"]);

    expect(getRemoveAction(makeTokenAccount(xrpMptToken))).toBeUndefined();
  });

  it("disables the removal while one of this token is pending", () => {
    const parentAccount = { ...XRP_ACCOUNT, pendingOperations: [makePendingOptOut(xrpIouToken)] };

    expect(getRemoveAction(makeTokenAccount(xrpIouToken), parentAccount)).toMatchObject({
      disabled: true,
      label: { props: { i18nKey: "xrp.removeToken.cta" } },
      modalOnDisabledClick: { component: RemovalPendingDrawer },
    });
  });

  it.each([
    ["currency", { ...xrpIouToken, tokenIdentifier: "USD" }],
    ["issuer", { ...xrpIouToken, contractAddress: "rOtherIssuer" }],
  ])("keeps the removal available while a token of another %s is pending", (_, otherToken) => {
    const parentAccount = { ...XRP_ACCOUNT, pendingOperations: [makePendingOptOut(otherToken)] };

    expect(getRemoveAction(makeTokenAccount(xrpIouToken), parentAccount)?.disabled).toBe(false);
  });

  it("greys out the removal of a frozen token", () => {
    const frozen = makeTokenAccount(xrpIouToken, { isLocked: true });

    expect(getRemoveAction(frozen)).toMatchObject({
      disabled: true,
      label: { props: { i18nKey: "xrp.removeToken.cta" } },
      modalOnDisabledClick: { component: TokenFrozenDrawer },
    });
  });
});
