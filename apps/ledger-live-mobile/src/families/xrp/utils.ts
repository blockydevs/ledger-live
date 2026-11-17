import type { TokenCurrency } from "@domain/entity-currency-token";
import BigNumber from "bignumber.js";
import type { Account, AccountBridge, AccountLike } from "@ledgerhq/types-live";
import { getAssetFromToken } from "@ledgerhq/live-common/families/xrp/bridge/api";
import type {
  Transaction,
  XrpTokenAccount,
  XrpTokenResources,
} from "@ledgerhq/live-common/families/xrp/types";
import type { ParamListBase } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { NavigatorName, ScreenName } from "~/const";

function getXrpResources(account: AccountLike): XrpTokenResources | undefined {
  if (account.type !== "TokenAccount") return undefined;

  return (account as XrpTokenAccount).xrpResources;
}

// A removed token keeps its token account, for its history, but loses its resources
export function findHeldTokenAccount(account: Account, token: TokenCurrency) {
  return (account.subAccounts ?? []).find(subAccount => {
    return subAccount.token.id === token.id && !!getXrpResources(subAccount);
  });
}

export function navigateToAddToken(
  navigation: NativeStackNavigationProp<ParamListBase>,
  accountId: string,
  token?: TokenCurrency,
) {
  if (!token) {
    navigation.navigate(NavigatorName.XrpAddTokenFlow, {
      screen: ScreenName.XrpAddTokenSelectToken,
      params: { accountId },
    });
    return;
  }

  navigation.navigate(NavigatorName.XrpAddTokenFlow, {
    screen: getTokenFirstScreen(token),
    params: { accountId, token },
  });
}

export function getTokenFirstScreen(token: TokenCurrency) {
  return token.tokenType === "iou" ? ScreenName.XrpAddTokenSettings : ScreenName.XrpAddTokenReview;
}

function toAssetFields(token: TokenCurrency) {
  const asset = getAssetFromToken(token);
  if (!asset || !("assetReference" in asset)) return {};

  return { assetReference: asset.assetReference, assetOwner: asset.assetOwner };
}

export function makeChangeTrustTransaction(
  bridge: AccountBridge<Transaction>,
  account: Account,
  token: TokenCurrency,
  amount: BigNumber,
): Transaction {
  return bridge.updateTransaction(bridge.createTransaction(account), {
    mode: "changeTrust",
    ...toAssetFields(token),
    amount,
  });
}

export function makeOptOutTransaction(
  bridge: AccountBridge<Transaction>,
  account: Account,
  token: TokenCurrency,
): Transaction {
  return bridge.updateTransaction(bridge.createTransaction(account), {
    mode: "optOut",
    ...toAssetFields(token),
    amount: new BigNumber(0),
  });
}

// An opt-out is a pending row of the XRP account, named by its asset fields
export function hasPendingRemoval(account: Account, token: TokenCurrency): boolean {
  return account.pendingOperations.some(operation => {
    const raw = operation.transactionRaw;
    if (operation.type !== "OPT_OUT" || !raw) return false;

    const isSameReference = "assetReference" in raw && raw.assetReference === token.tokenIdentifier;
    const isSameOwner = "assetOwner" in raw && raw.assetOwner === token.contractAddress;

    return isSameReference && isSameOwner;
  });
}

export function readStringField(error: Error | undefined, field: string): string | undefined {
  const value = (error as Record<string, unknown> | undefined)?.[field];

  return typeof value === "string" ? value : undefined;
}
