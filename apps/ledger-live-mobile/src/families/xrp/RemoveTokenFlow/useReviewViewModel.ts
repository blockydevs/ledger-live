import { useCallback, useEffect } from "react";
import { useNavigation, useRoute } from "@react-navigation/native";
import BigNumber from "bignumber.js";
import invariant from "invariant";
import useBridgeTransaction from "@ledgerhq/live-common/bridge/useBridgeTransaction";
import { useAccountBridge } from "@ledgerhq/live-common/bridge/useAccountBridge";
import { formatCurrencyUnit } from "@ledgerhq/live-common/currencies/index";
import type { Transaction } from "@ledgerhq/live-common/families/xrp/types";
import { useAccountScreen } from "LLM/hooks/useAccountScreen";
import type { BaseComposite, StackNavigatorProps } from "~/components/RootNavigator/types/helpers";
import { NavigatorName, ScreenName } from "~/const";
import { makeOptOutTransaction, readStringField } from "../utils";
import type { XrpRemoveTokenFlowParamList } from "./types";

export type Props = BaseComposite<
  StackNavigatorProps<XrpRemoveTokenFlowParamList, ScreenName.XrpRemoveTokenReview>
>;

const BALANCE_NOT_ZERO = "XrpOptOutBalanceNotZero";

export function useReviewViewModel() {
  const navigation = useNavigation<Props["navigation"]>();
  const route = useRoute<Props["route"]>();
  const { account: tokenAccount, parentAccount: xrpAccount } = useAccountScreen(route);
  invariant(xrpAccount?.type === "Account", "xrp: the token account must have its XRP account");

  const { token } = route.params;
  const tokenAccountId = route.params.accountId;
  const balance = tokenAccount?.balance ?? new BigNumber(0);

  const bridge = useAccountBridge<Transaction>(xrpAccount);
  const {
    transaction,
    status,
    bridgeError,
    bridgePending,
    account: bridgeAccount,
    updateAccount,
    updateTransaction,
  } = useBridgeTransaction<Transaction>(bridge, () => ({
    account: xrpAccount,
    transaction: makeOptOutTransaction(bridge, xrpAccount, token),
  }));

  useEffect(() => {
    if (bridgeAccount === xrpAccount) return;

    updateAccount(xrpAccount);
    updateTransaction(tx => ({ ...tx }));
  }, [xrpAccount, bridgeAccount, updateAccount, updateTransaction]);

  const onSend = useCallback(() => {
    navigation.navigate(NavigatorName.SendFunds, {
      screen: ScreenName.SendSelectRecipient,
      params: { accountId: tokenAccountId, parentId: xrpAccount.id },
    });
  }, [xrpAccount.id, navigation, tokenAccountId]);

  const onContinue = useCallback(() => {
    if (!transaction) return;

    navigation.navigate(ScreenName.XrpRemoveTokenSelectDevice, {
      accountId: xrpAccount.id,
      token,
      transaction,
      status,
    });
  }, [xrpAccount.id, navigation, status, token, transaction]);

  const statusErrors = Object.values(status.errors);
  const isBalanceNotZero = statusErrors.some(error => error.name === BALANCE_NOT_ZERO);
  const otherErrors = statusErrors.filter(error => error.name !== BALANCE_NOT_ZERO);
  const { reserve: reserveReleaseWarning, ...otherWarnings } = status.warnings;
  const errors = [...(bridgeError ? [bridgeError] : []), ...otherErrors];
  const isHoldingBalance = balance.gt(0);

  return {
    token,
    errors,
    onSend,
    onContinue,
    isIou: token.tokenType === "iou",
    accountUnit: xrpAccount.currency.units[0],
    estimatedFees: status.estimatedFees,
    unlockedAmount: readStringField(reserveReleaseWarning, "amount"),
    isBalanceBlocked: isHoldingBalance || isBalanceNotZero,
    warnings: Object.values(otherWarnings),
    isContinueDisabled: bridgePending || errors.length > 0,
    isContinueLoading: bridgePending,
    heldBalance: isHoldingBalance
      ? formatCurrencyUnit(token.units[0], balance, { showCode: true, disableRounding: true })
      : undefined,
  };
}
