import React, { useCallback } from "react";
import { StyleSheet, Switch, View } from "react-native";
import BigNumber from "bignumber.js";
import invariant from "invariant";
import { Text } from "@ledgerhq/native-ui";
import { getMainAccount } from "@ledgerhq/live-common/account/index";
import { useAccountBridge } from "@ledgerhq/live-common/bridge/useAccountBridge";
import useBridgeTransaction from "@ledgerhq/live-common/bridge/useBridgeTransaction";
import { getMinBondAmount, isAleoAccount } from "@ledgerhq/live-common/families/aleo/utils";
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
import type { BaseComposite, StackNavigatorProps } from "~/components/RootNavigator/types/helpers";
import type { BondPublicFlowParamList } from "./types";

type Props = BaseComposite<
  StackNavigatorProps<BondPublicFlowParamList, ScreenName.AleoBondPublicAmount>
>;

export default function Amount({ navigation, route }: Props) {
  const { account, parentAccount } = useSelector(accountScreenSelector(route));

  invariant(
    account && isAleoAccount(account) && account.type === "Account",
    "aleo account required",
  );

  const aleoAccount = account as AleoAccount;
  const mainAccount = getMainAccount(aleoAccount, parentAccount ?? null);
  const unit = aleoAccount.currency.units[0];
  const spendable = aleoAccount.aleoResources?.transparentBalance ?? aleoAccount.spendableBalance;
  const bondedBalance = aleoAccount.aleoResources?.bondedBalance ?? new BigNumber(0);
  const minBondAmount = getMinBondAmount(bondedBalance);
  const isTopUp = bondedBalance.gt(0) && bondedBalance.lt(MIN_DELEGATOR_STAKE_MICROCREDITS);
  const belowMinimum = spendable.lt(minBondAmount);

  const bridge = useAccountBridge<AleoTransaction>(aleoAccount, parentAccount);

  const { transaction, setTransaction, status, bridgePending, bridgeError } = useBridgeTransaction(
    bridge,
    () => {
      const created = bridge.createTransaction(mainAccount);
      // The withdrawal address is always the account itself and is never offered as a choice.
      const prepared = bridge.updateTransaction(created, {
        mode: "bond_public",
        recipient: route.params.validatorAddress,
        withdrawal: mainAccount.freshAddress,
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

  const onChangeValidator = useCallback(() => {
    navigation.navigate(ScreenName.AleoBondPublicSelectValidator, {
      accountId: route.params.accountId,
      parentId: route.params.parentId,
      validatorAddress: route.params.validatorAddress,
    });
  }, [navigation, route.params]);

  const onContinue = useCallback(() => {
    if (!transaction) return;
    navigation.navigate(ScreenName.AleoBondPublicSelectDevice, {
      accountId: route.params.accountId,
      parentId: route.params.parentId,
      transaction,
      status,
    });
  }, [navigation, route.params, status, transaction]);

  if (!transaction) return null;

  const { useAllAmount } = transaction;
  const { amount } = status;
  // A recipient problem (already bonded elsewhere, closed/unbonding validator) is real
  // regardless of the amount typed, so it is never suppressed by an untouched screen.
  const recipientError = status.errors.recipient;
  const showChangeValidator = !!recipientError;
  // Keeps an untouched screen free of the zero-amount error, while the max switch — where the
  // bridge owns the amount — still reports it.
  const error = recipientError
    ? recipientError
    : (amount.eq(0) && !useAllAmount) || bridgePending
      ? null
      : getFirstStatusError(status, "errors");
  const warning = getFirstStatusError(status, "warnings");
  const continueDisabled =
    bridgePending || !!bridgeError || amount.eq(0) || Object.keys(status.errors).length > 0;

  return (
    <SafeAreaView style={styles.root} edges={["bottom"]}>
      <TrackScreen category="BondPublicFlow" name="Amount" flow="bond" currency="aleo" />
      <View style={styles.content}>
        <View style={styles.alert}>
          <Alert type="hint">
            <Trans
              i18nKey="aleo.bond.amount.stakingAlert"
              components={{
                minimum: (
                  <CurrencyUnitValue
                    unit={unit}
                    value={new BigNumber(MIN_DELEGATOR_STAKE_MICROCREDITS)}
                    showCode
                  />
                ),
              }}
            />
          </Alert>
        </View>
        {belowMinimum && (
          <View style={styles.alert}>
            <Alert type="warning">
              <Trans
                i18nKey="aleo.bond.amount.belowMinimum"
                components={{
                  missing: (
                    <CurrencyUnitValue
                      unit={unit}
                      value={minBondAmount.minus(spendable)}
                      showCode
                    />
                  ),
                  minimum: <CurrencyUnitValue unit={unit} value={minBondAmount} showCode />,
                }}
              />
            </Alert>
          </View>
        )}
        <AmountInput
          account={aleoAccount}
          value={amount}
          onChange={onChange}
          editable={!useAllAmount}
          error={error}
          warning={warning}
          errorField="description"
          testID="aleo-bond-amount-input"
        />
        {showChangeValidator && (
          <Button
            type="main"
            outline
            onPress={onChangeValidator}
            testID="aleo-bond-change-validator"
            event="AleoBondAmountChangeValidator"
          >
            <Trans i18nKey="aleo.bond.amount.changeValidator" />
          </Button>
        )}
        <View style={styles.balanceRow}>
          <Text variant="small" color="neutral.c70">
            <Trans i18nKey="aleo.bond.amount.available" />{" "}
            <CurrencyUnitValue unit={unit} value={spendable} showCode />
          </Text>
          <View style={styles.switchRow}>
            <Text variant="small" color="neutral.c70" mr={2}>
              <Trans i18nKey="common.max" />
            </Text>
            <Switch
              value={!!useAllAmount}
              onValueChange={toggleUseAllAmount}
              disabled={belowMinimum}
              accessibilityState={{ disabled: belowMinimum }}
              testID="aleo-bond-use-all-amount"
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
        <View style={styles.minimumRow}>
          <Text variant="small" color="neutral.c70">
            {isTopUp ? (
              <Trans
                i18nKey="aleo.bond.amount.minimumTopUp"
                components={{
                  missing: <CurrencyUnitValue unit={unit} value={minBondAmount} showCode />,
                  total: (
                    <CurrencyUnitValue
                      unit={unit}
                      value={new BigNumber(MIN_DELEGATOR_STAKE_MICROCREDITS)}
                      showCode
                    />
                  ),
                }}
              />
            ) : (
              <Trans
                i18nKey="aleo.bond.amount.minimum"
                components={{
                  minimum: <CurrencyUnitValue unit={unit} value={minBondAmount} showCode />,
                }}
              />
            )}
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
          testID="aleo-bond-amount-continue"
          event="AleoBondAmountContinue"
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
  minimumRow: { marginTop: 12 },
  footer: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 },
  button: { alignSelf: "stretch" },
});
