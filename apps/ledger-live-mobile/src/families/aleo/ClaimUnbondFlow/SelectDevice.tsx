import React, { useCallback } from "react";
import { StyleSheet } from "react-native";
import invariant from "invariant";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@react-navigation/native";
import { Flex } from "@ledgerhq/native-ui";
import type { Device } from "@ledgerhq/live-common/hw/actions/types";
import { getMainAccount } from "@ledgerhq/live-common/account/index";
import { useAccountBridge } from "@ledgerhq/live-common/bridge/useAccountBridge";
import useBridgeTransaction from "@ledgerhq/live-common/bridge/useBridgeTransaction";
import { isAleoAccount } from "@ledgerhq/live-common/families/aleo/utils";
import type {
  AleoAccount,
  Transaction as AleoTransaction,
} from "@ledgerhq/live-common/families/aleo/types";
import { TrackScreen } from "~/analytics";
import SelectDevice from "~/components/SelectDevice2";
import { setLastConnectedDevice, setReadOnlyMode } from "~/actions/settings";
import { useDispatch, useSelector } from "~/context/hooks";
import { accountScreenSelector } from "~/reducers/accounts";
import { ScreenName } from "~/const";
import type { BaseComposite, StackNavigatorProps } from "~/components/RootNavigator/types/helpers";
import type { ClaimUnbondFlowParamList } from "./types";

type Props = BaseComposite<
  StackNavigatorProps<ClaimUnbondFlowParamList, ScreenName.AleoClaimUnbondSelectDevice>
>;

export default function ClaimUnbondSelectDevice({ navigation, route }: Props) {
  const { colors } = useTheme();
  const dispatch = useDispatch();
  const { account, parentAccount } = useSelector(accountScreenSelector(route));

  invariant(
    account && isAleoAccount(account) && account.type === "Account",
    "aleo account required",
  );

  const aleoAccount = account as AleoAccount;
  const mainAccount = getMainAccount(aleoAccount, parentAccount ?? null);
  const bridge = useAccountBridge<AleoTransaction>(aleoAccount, parentAccount);

  const { transaction, status } = useBridgeTransaction(bridge, () => {
    const created = bridge.createTransaction(mainAccount);
    // `claim_unbond_public` names only the staker; the chain pays out the whole entry, so
    // there is no amount to sign and nothing for the user to choose.
    const prepared = bridge.updateTransaction(created, {
      mode: "claim_unbond_public",
      recipient: mainAccount.freshAddress,
    });

    return {
      account: aleoAccount,
      parentAccount: parentAccount ?? undefined,
      transaction: prepared,
    };
  });

  const onSelect = useCallback(
    (device: Device) => {
      if (!transaction) return;
      dispatch(setLastConnectedDevice(device));
      dispatch(setReadOnlyMode(false));
      navigation.navigate(ScreenName.AleoClaimUnbondConnectDevice, {
        accountId: route.params.accountId,
        parentId: route.params.parentId,
        transaction,
        status,
        device,
      });
    },
    [dispatch, navigation, route.params, status, transaction],
  );

  const requestToSetHeaderOptions = useCallback(() => undefined, []);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <TrackScreen category="ClaimUnbondFlow" name="SelectDevice" flow="claim" currency="aleo" />
      <Flex px={16} pb={8} flex={1}>
        <SelectDevice
          onSelect={onSelect}
          requestToSetHeaderOptions={requestToSetHeaderOptions}
          autoSelectLastConnectedDevice={!route.params.forceSelectDevice}
        />
      </Flex>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
