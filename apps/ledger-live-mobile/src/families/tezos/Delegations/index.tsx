import React, { useCallback, useMemo, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { differenceInCalendarDays } from "date-fns";
import { useNavigation, useTheme } from "@react-navigation/native";
import { Trans, useTranslation } from "~/context/Locale";
import { BaseNavigatorStackParamList } from "~/components/RootNavigator/types/BaseNavigator";
import { StackNavigatorProps } from "~/components/RootNavigator/types/helpers";
import { getAccountCurrency, shortAddressPreview } from "@ledgerhq/live-common/account/index";
import { getAddressExplorer, getDefaultExplorerView } from "@ledgerhq/live-common/explorers";
import {
  isFinalizablePosition,
  useBaker,
  useTezosStakingInfo,
} from "@ledgerhq/live-common/families/tezos/react";
import type { StakingPosition } from "@ledgerhq/live-common/families/tezos/types";
import type { AccountLike } from "@ledgerhq/types-live";
import { useAccountUnit } from "LLM/hooks/useAccountUnit";
import AccountDelegationInfo from "~/components/AccountDelegationInfo";
import AccountSectionLabel from "~/components/AccountSectionLabel";
import DelegationDrawer, { type FieldType } from "~/components/DelegationDrawer";
import LText from "~/components/LText";
import Touchable from "~/components/Touchable";
import IlluRewards from "~/icons/images/Rewards";
import { NavigatorName, ScreenName } from "~/const";
import { urls } from "~/utils/urls";
import { useAccountName } from "~/reducers/wallet";
import BakerImage from "../BakerImage";
import DelegationRow from "./Row";
import LabelRight from "./LabelRight";

type Props = Readonly<{
  account: AccountLike;
}>;

type Navigation = StackNavigatorProps<BaseNavigatorStackParamList, ScreenName.Account>;

type Selected =
  | { kind: "stake" }
  | { kind: "delegation" }
  | { kind: "unstaking"; position: StakingPosition };

export default function TezosDelegation({ account }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const navigation = useNavigation<Navigation["navigation"]>();
  const info = useTezosStakingInfo(account);
  const unit = useAccountUnit(account);
  const currency = getAccountCurrency(account);
  const fallbackBaker = useBaker(info.delegation?.address || info.delegateAddress || "");
  const accountName = useAccountName(account);

  const [selected, setSelected] = useState<Selected | undefined>();
  const onCloseDrawer = useCallback(() => setSelected(undefined), []);

  const baker = info.delegation?.baker ?? fallbackBaker;
  const delegateAddress = info.delegateAddress ?? "";

  const ops = account.type === "Account" ? account.operations ?? [] : [];
  const lastStake = ops.find(o => o?.type === "STAKE");
  const lastDelegate = ops.find(o => o?.type === "DELEGATE");
  const stakeDays = lastStake ? differenceInCalendarDays(Date.now(), lastStake.date) : 0;
  const delegationDate = info.delegation?.operation.date ?? lastDelegate?.date;
  const delegationDays = delegationDate ? differenceInCalendarDays(Date.now(), delegationDate) : 0;

  const onDelegate = useCallback(() => {
    if (account.type !== "Account") return;
    navigation.navigate(NavigatorName.TezosDelegationFlow, {
      screen: ScreenName.DelegationStarted,
      params: { accountId: account.id },
    });
  }, [account, navigation]);

  // Section "manage" CTAs are visible but inert until the stake / unstake flows land.
  const onManageStub = useCallback(() => undefined, []);

  const onOpenExplorer = useCallback(() => {
    if (account.type !== "Account" || !delegateAddress) return;
    const url = getAddressExplorer(getDefaultExplorerView(account.currency), delegateAddress);
    if (url) Linking.openURL(url);
  }, [account, delegateAddress]);

  const validatorField: FieldType = useMemo(
    () => ({
      label: t("delegation.validator"),
      Component: (
        <LText numberOfLines={1} semiBold ellipsizeMode="middle" style={styles.fieldValue}>
          {baker?.name ?? shortAddressPreview(delegateAddress)}
        </LText>
      ),
    }),
    [t, baker, delegateAddress],
  );

  const durationField = useCallback(
    (days: number): FieldType => ({
      label: t("delegation.duration"),
      Component: (
        <LText semiBold style={styles.fieldValue}>
          {days ? (
            <Trans i18nKey="delegation.durationDays" count={days} values={{ count: days }} />
          ) : (
            <Trans i18nKey="delegation.durationDays0" />
          )}
        </LText>
      ),
    }),
    [t],
  );

  const drawerData = useMemo<FieldType[]>(() => {
    if (!selected) return [];

    if (selected.kind === "unstaking") {
      const pos = selected.position;
      const finalizable = isFinalizablePosition(pos.uid);
      const unstakeDays = pos.createdAt
        ? differenceInCalendarDays(Date.now(), new Date(pos.createdAt))
        : 0;
      return [
        validatorField,
        {
          label: t("tezos.staking.status"),
          Component: (
            <LText semiBold style={styles.fieldValue}>
              {t(finalizable ? "tezos.staking.available" : "tezos.staking.unstaking")}
            </LText>
          ),
        },
        durationField(unstakeDays),
      ];
    }

    return [
      validatorField,
      {
        label: t("delegation.validatorAddress"),
        Component: (
          <Touchable event="TezosDelegationOpenExplorer" onPress={onOpenExplorer}>
            <LText
              numberOfLines={1}
              semiBold
              ellipsizeMode="middle"
              style={styles.fieldValue}
              color="live"
            >
              {delegateAddress}
            </LText>
          </Touchable>
        ),
      },
      {
        label: t("delegation.delegatedAccount"),
        Component: (
          <LText numberOfLines={1} semiBold ellipsizeMode="middle" style={styles.fieldValue}>
            {accountName}
          </LText>
        ),
      },
      durationField(selected.kind === "stake" ? stakeDays : delegationDays),
    ];
  }, [
    selected,
    t,
    validatorField,
    durationField,
    onOpenExplorer,
    delegateAddress,
    accountName,
    stakeDays,
    delegationDays,
  ]);

  if (account.type !== "Account") return null;

  if (!info.isStaked && !info.isDelegated && !info.hasUnstaking) {
    return (
      <View style={styles.root}>
        <AccountDelegationInfo
          title={t("account.delegation.info.title")}
          image={<IlluRewards style={styles.illustration} />}
          description={t("account.delegation.delegationEarn", { name: account.currency.name })}
          infoUrl={urls.delegation}
          infoTitle={t("account.delegation.howItWorks")}
          onPress={onDelegate}
          ctaTitle={t("account.delegation.info.cta")}
        />
      </View>
    );
  }

  let drawerAmount = info.availableBalance;
  if (selected?.kind === "unstaking") drawerAmount = selected.position.amount;
  else if (selected?.kind === "stake") drawerAmount = info.stakedBalance;

  const stakingRows: {
    key: string;
    amount: StakingPosition["amount"];
    statusLabel?: string;
    onPress: () => void;
  }[] = [];
  if (info.isStaked) {
    stakingRows.push({
      key: "stake",
      amount: info.stakedBalance,
      onPress: () => setSelected({ kind: "stake" }),
    });
  }
  info.unstakingPositions.forEach(position => {
    stakingRows.push({
      key: position.uid,
      amount: position.amount,
      statusLabel: t(
        isFinalizablePosition(position.uid) ? "tezos.staking.available" : "tezos.staking.unstaking",
      ),
      onPress: () => setSelected({ kind: "unstaking", position }),
    });
  });

  const showStaking = stakingRows.length > 0;

  return (
    <View style={styles.root}>
      {showStaking && (
        <View>
          <AccountSectionLabel
            name={t("tezos.staking.sectionLabel")}
            RightComponent={
              <LabelRight disabled onPress={onManageStub} label={t("tezos.manage")} />
            }
          />
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            {stakingRows.map((row, i) => (
              <DelegationRow
                key={row.key}
                baker={baker}
                address={delegateAddress}
                amount={row.amount}
                unit={unit}
                currency={currency}
                statusLabel={row.statusLabel}
                onPress={row.onPress}
                isLast={i === stakingRows.length - 1}
              />
            ))}
          </View>
        </View>
      )}

      {info.isDelegated && (
        <View style={showStaking ? styles.spacedTop : undefined}>
          <AccountSectionLabel
            name={t("tezos.delegation.sectionLabel")}
            RightComponent={
              <LabelRight disabled onPress={onManageStub} label={t("tezos.manage")} />
            }
          />
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <DelegationRow
              baker={baker}
              address={delegateAddress}
              amount={info.availableBalance}
              unit={unit}
              currency={currency}
              onPress={() => setSelected({ kind: "delegation" })}
              isLast
            />
          </View>
        </View>
      )}

      <DelegationDrawer
        isOpen={!!selected}
        onClose={onCloseDrawer}
        account={account}
        ValidatorImage={({ size }) => <BakerImage size={size} baker={baker} />}
        amount={drawerAmount}
        data={drawerData}
        actions={[]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    padding: 16,
  },
  illustration: {
    alignSelf: "center",
    marginBottom: 16,
  },
  spacedTop: {
    marginTop: 24,
  },
  card: {
    borderRadius: 4,
    marginTop: 12,
  },
  fieldValue: {
    fontSize: 14,
  },
});
