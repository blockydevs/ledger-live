import React, { useCallback } from "react";
import { StyleSheet, Switch, View } from "react-native";
import BigNumber from "bignumber.js";
import invariant from "invariant";
import { Text } from "@ledgerhq/native-ui";
import { getMainAccount } from "@ledgerhq/live-common/account/index";
import { useAccountBridge } from "@ledgerhq/live-common/bridge/useAccountBridge";
import useBridgeTransaction from "@ledgerhq/live-common/bridge/useBridgeTransaction";
import { isAleoAccount } from "@ledgerhq/live-common/families/aleo/utils";
import { useStakingPosition } from "@ledgerhq/live-common/families/aleo/react";
import { MIN_DELEGATOR_STAKE_MICROCREDITS } from "@ledgerhq/live-common/families/aleo/constants";
import type {
  AleoAccount,
  Transaction as AleoTransaction,
} from "@ledgerhq/live-common/families/aleo/types";
import SafeAreaView from "~/components/SafeAreaView";
import { Trans } from "~/context/Locale";
import { useSelector } from "~/context/hooks";
import { accountScreenSelector } from "~/reducers/accounts";
import { TrackScreen } from "~/analytics";
import AmountInput from "~/screens/SendFunds/AmountInput";
import CurrencyUnitValue from "~/components/CurrencyUnitValue";
import TranslatedError from "~/components/TranslatedError";
import Alert from "~/components/Alert";
import Button from "~/components/wrappedUi/Button";
import { ScreenName } from "~/const";
import { getFirstStatusError } from "../../helpers";
import { UNBONDING_PERIOD_BLOCKS } from "../constants";
import type { BaseComposite, StackNavigatorProps } from "~/components/RootNavigator/types/helpers";
import type { UnbondFlowParamList } from "./types";

type Props = BaseComposite<StackNavigatorProps<UnbondFlowParamList, ScreenName.AleoUnbondAmount>>;

export default function Amount({ navigation, route }: Props) {
  const { account, parentAccount } = useSelector(accountScreenSelector(route));

  invariant(
    account && isAleoAccount(account) && account.type === "Account",
    "aleo account required",
  );

  const aleoAccount = account as AleoAccount;
  const mainAccount = getMainAccount(aleoAccount, parentAccount ?? null);
  const unit = aleoAccount.currency.units[0];
  const position = useStakingPosition(aleoAccount);
  const { bondedBalance, unbondingBalance, claimableBalance, hasUnbonding } = position;

  const bridge = useAccountBridge<AleoTransaction>(aleoAccount, parentAccount);

  const { transaction, setTransaction, status, bridgePending, bridgeError } = useBridgeTransaction(
    bridge,
    () => {
      const created = bridge.createTransaction(mainAccount);
      // `recipient` carries the on-chain `staker`, which is always the account itself;
      // prepareTransaction re-pins it, so this is only a sensible starting value.
      const prepared = bridge.updateTransaction(created, {
        mode: "unbond_public",
        recipient: mainAccount.freshAddress,
      });

      return {
        account: aleoAccount,
        parentAccount: parentAccount ?? undefined,
        transaction: prepared,
      };
    },
  );

  const onChange = useCallback(
    (amount: BigNumber) => {
      if (!transaction || amount.isNaN()) return;
      setTransaction(bridge.updateTransaction(transaction, { amount, useAllAmount: false }));
    },
    [bridge, setTransaction, transaction],
  );

  const toggleUseAllAmount = useCallback(() => {
    if (!transaction) return;
    setTransaction(
      bridge.updateTransaction(transaction, {
        amount: new BigNumber(0),
        useAllAmount: !transaction.useAllAmount,
      }),
    );
  }, [bridge, setTransaction, transaction]);

  const onContinue = useCallback(() => {
    if (!transaction) return;
    navigation.navigate(ScreenName.AleoUnbondSelectDevice, {
      accountId: route.params.accountId,
      parentId: route.params.parentId,
      transaction,
      status,
    });
  }, [navigation, route.params, status, transaction]);

  if (!transaction) return null;

  const { useAllAmount } = transaction;
  const { amount } = status;
  const remaining = bondedBalance.minus(amount);
  // The chain unbonds everything rather than leave a sub-minimum stake, so the typed amount
  // would be a lie exactly in this window.
  const leavesSubMinimum =
    !useAllAmount &&
    amount.gt(0) &&
    remaining.gt(0) &&
    remaining.lt(MIN_DELEGATOR_STAKE_MICROCREDITS);

  const error =
    (amount.eq(0) && !useAllAmount) || bridgePending ? null : getFirstStatusError(status, "errors");
  const warning = getFirstStatusError(status, "warnings");
  const continueDisabled =
    bridgePending || !!bridgeError || amount.eq(0) || Object.keys(status.errors).length > 0;

  return (
    <SafeAreaView style={styles.root} edges={["bottom"]}>
      <TrackScreen category="UnbondFlow" name="Amount" flow="unbond" currency="aleo" />
      <View style={styles.content}>
        <View style={styles.alert}>
          <Alert type="hint" testID="aleo-unbond-unbondable-banner">
            <Trans
              i18nKey="aleo.unbond.amount.unbondableBanner"
              components={{
                maximum: <CurrencyUnitValue unit={unit} value={bondedBalance} showCode />,
              }}
            />
          </Alert>
        </View>
        {leavesSubMinimum && (
          <View style={styles.alert}>
            <Alert type="warning" testID="aleo-unbond-below-minimum">
              <Trans
                i18nKey="aleo.unbond.amount.belowMinimum"
                components={{
                  amount: <CurrencyUnitValue unit={unit} value={amount} showCode />,
                  remaining: <CurrencyUnitValue unit={unit} value={remaining} showCode />,
                  minimum: (
                    <CurrencyUnitValue
                      unit={unit}
                      value={new BigNumber(MIN_DELEGATOR_STAKE_MICROCREDITS)}
                      showCode
                    />
                  ),
                  bonded: <CurrencyUnitValue unit={unit} value={bondedBalance} showCode />,
                }}
              />
            </Alert>
          </View>
        )}
        {hasUnbonding &&
          (claimableBalance.gt(0) ? (
            <View style={styles.alert}>
              <Alert type="warning" testID="aleo-unbond-claim-first">
                <Trans
                  i18nKey="aleo.unbond.amount.claimFirst"
                  values={{ blocks: UNBONDING_PERIOD_BLOCKS }}
                  components={{
                    claimable: <CurrencyUnitValue unit={unit} value={claimableBalance} showCode />,
                  }}
                />
              </Alert>
            </View>
          ) : (
            <View style={styles.alert}>
              <Alert type="warning" testID="aleo-unbond-merge-warning">
                <Trans
                  i18nKey="aleo.unbond.amount.mergeWarning"
                  values={{ blocks: UNBONDING_PERIOD_BLOCKS }}
                  components={{
                    pending: <CurrencyUnitValue unit={unit} value={unbondingBalance} showCode />,
                  }}
                />
              </Alert>
            </View>
          ))}
        <AmountInput
          account={aleoAccount}
          value={amount}
          onChange={onChange}
          editable={!useAllAmount}
          error={error}
          warning={warning}
          errorField="description"
          testID="aleo-unbond-amount-input"
        />
        <View style={styles.balanceRow}>
          <Text variant="small" color="neutral.c70">
            <Trans i18nKey="aleo.unbond.amount.available" />{" "}
            <CurrencyUnitValue unit={unit} value={bondedBalance} showCode />
          </Text>
          <View style={styles.switchRow}>
            <Text variant="small" color="neutral.c70" mr={2}>
              <Trans i18nKey="common.max" />
            </Text>
            <Switch
              value={!!useAllAmount}
              onValueChange={toggleUseAllAmount}
              testID="aleo-unbond-use-all-amount"
            />
          </View>
        </View>
        <View style={styles.feeRow}>
          <Text variant="small" color="neutral.c70">
            <Trans i18nKey="send.summary.fees" />{" "}
            {bridgePending ? (
              "-"
            ) : (
              <CurrencyUnitValue unit={unit} value={status.estimatedFees} showCode />
            )}
          </Text>
        </View>
        <View style={styles.claimStepRow}>
          <Text variant="small" color="neutral.c70">
            <Trans i18nKey="aleo.unbond.amount.claimStep" />
          </Text>
        </View>
      </View>
      <View style={styles.footer}>
        {bridgeError && (
          <Text variant="small" color="error.c50" mb={2} textAlign="center">
            <TranslatedError error={bridgeError} />
          </Text>
        )}
        <Button
          type="main"
          onPress={onContinue}
          style={styles.button}
          disabled={continueDisabled}
          pending={bridgePending}
          testID="aleo-unbond-amount-continue"
          event="AleoUnbondAmountContinue"
        >
          <Trans i18nKey="common.continue" />
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 16 },
  alert: { marginBottom: 16 },
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
  },
  switchRow: { flexDirection: "row", alignItems: "center" },
  feeRow: { marginTop: 12 },
  claimStepRow: { marginTop: 12 },
  footer: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 },
  button: { alignSelf: "stretch" },
});
