import { useCallback } from "react";
import { useNavigation } from "@react-navigation/native";
import { getMainAccount } from "@ledgerhq/live-common/account/index";
import { ScreenName } from "~/const";
import { getCustomSendFlow } from "~/screens/SendFunds/utils/customSendFlow";
import { useSendFlowActions, useSendFlowData } from "../../../context/SendFlowContext";
import type { SendFlowNavigationProp } from "../../../types";

export function useBalanceTypeSyncScreenViewModel() {
  const { state } = useSendFlowData();
  const { close } = useSendFlowActions();
  const navigation = useNavigation<SendFlowNavigationProp>();

  const { account, parentAccount } = state.account;
  const mainAccount = account ? getMainAccount(account, parentAccount ?? undefined) : undefined;
  const family = mainAccount?.currency.family;
  const BalanceTypeSync = family ? getCustomSendFlow(family)?.BalanceTypeSync : undefined;

  const onComplete = useCallback(() => {
    navigation.replace(ScreenName.SendFlowRecipient);
  }, [navigation]);

  return {
    BalanceTypeSync,
    onComplete,
    account: mainAccount,
    transaction: state.transaction.transaction,
    onClose: close,
  };
}
