import BigNumber from "bignumber.js";
import type { TokenCurrency } from "@domain/entity-currency-token";
import type { Account } from "@ledgerhq/types-live";
import type { XrpTokenAccount, XrpTokenResources } from "@ledgerhq/live-common/families/xrp/types";
import { genAccount, genTokenAccount } from "@ledgerhq/ledger-wallet-framework/mocks/account";
import { xrpIouToken, xrpMptToken, xrpTestnetCurrency } from "./currency.mock";

// An IOU amount is 15 digits and an exponent: its base unit is 10^-38. The issuer is a valid account,
// as the review step asks the network for its fee.
export const XRP_TOKEN: TokenCurrency = {
  ...xrpIouToken,
  contractAddress: "r9fnpoGUNqCWMppMStPEQY9R4UEbpCek4",
  tokenIdentifier: "524C555344000000000000000000000000000000",
  units: [{ ...xrpIouToken.units[0], magnitude: 38 }],
};

export const XRP_ACCOUNT: Account = {
  ...genAccount("xrp-1", { currency: xrpTestnetCurrency }),
  subAccounts: [],
};

export function makeXrpTokenAccount(resources: Partial<XrpTokenResources> = {}): XrpTokenAccount {
  return {
    ...genTokenAccount(0, XRP_ACCOUNT, XRP_TOKEN),
    xrpResources: { isLocked: false, ...resources },
  };
}

export const XRP_IOU_TOKEN_ACCOUNT: XrpTokenAccount = {
  ...genTokenAccount(0, XRP_ACCOUNT, xrpIouToken),
  xrpResources: { isLocked: false, limit: new BigNumber(1000), isRippling: false },
};

export const XRP_MPT_TOKEN_ACCOUNT: XrpTokenAccount = {
  ...genTokenAccount(1, XRP_ACCOUNT, xrpMptToken),
  xrpResources: { isLocked: false },
};

export const XRP_REMOVED_TOKEN_ACCOUNT: XrpTokenAccount = genTokenAccount(
  2,
  XRP_ACCOUNT,
  xrpIouToken,
);
