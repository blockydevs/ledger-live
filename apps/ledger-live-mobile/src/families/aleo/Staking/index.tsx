import React, { useCallback, useState } from "react";
import { Flex } from "@ledgerhq/native-ui";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "~/context/Locale";
import type { AccountLike } from "@ledgerhq/types-live";
import { useStakingPosition } from "@ledgerhq/live-common/families/aleo/react";
import { getCurrencyConfiguration } from "@ledgerhq/live-common/config/index";
import type { AleoAccount, AleoCoinConfig } from "@ledgerhq/live-common/families/aleo/types";
import AccountSectionLabel from "~/components/AccountSectionLabel";
import AccountDelegationInfo from "~/components/AccountDelegationInfo";
import IlluRewards from "~/icons/images/Rewards";
import { urls } from "~/utils/urls";
import { NavigatorName, ScreenName } from "~/const";
import StakingSummary from "./StakingSummary";
import StakedRow from "./StakedRow";
import Unstakings from "./Unstakings";
import ManageDrawer from "./ManageDrawer";

// The section is absent, not disabled, while the config flag is off, so staking stays
// unreachable from the account page.
const isStakingEnabled = (account: AleoAccount): boolean => {
  try {
    return !!getCurrencyConfiguration<AleoCoinConfig>(account.currency.id)?.enableStaking;
  } catch {
    return false;
  }
};

function Staking({ account }: { account: AleoAccount }) {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<{ [key: string]: object }>>();
  const position = useStakingPosition(account);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const onCloseDrawer = useCallback(() => setDrawerOpen(false), []);

  const onBond = useCallback(() => {
    navigation.navigate(NavigatorName.AleoBondPublicFlow, {
      screen: ScreenName.AleoBondPublicSelectValidator,
      params: { accountId: account.id },
    });
  }, [navigation, account.id]);

  const onUnstake = useCallback(() => {
    setDrawerOpen(false);
    navigation.navigate(NavigatorName.AleoUnbondFlow, {
      screen: ScreenName.AleoUnbondAmount,
      params: { accountId: account.id },
    });
  }, [navigation, account.id]);

  const onClaim = useCallback(() => {
    setDrawerOpen(false);
    navigation.navigate(NavigatorName.AleoClaimUnbondFlow, {
      screen: ScreenName.AleoClaimUnbondSelectDevice,
      params: { accountId: account.id },
    });
  }, [navigation, account.id]);

  if (!position.hasBonded && !position.hasUnbonding) {
    return (
      <AccountDelegationInfo
        title={t("aleo.stake.sectionTitle")}
        description={t("aleo.stake.emptyState.description", { name: account.currency.name })}
        image={<IlluRewards />}
        infoUrl={urls.stakingRewards}
        infoTitle={t("aleo.stake.sectionTitle")}
        onPress={onBond}
        ctaTitle={t("aleo.stake.emptyState.cta")}
      />
    );
  }

  return (
    <Flex testID="aleo-staking-section">
      <AccountSectionLabel name={t("aleo.stake.sectionTitle")} />
      <StakingSummary account={account} position={position} />
      {position.hasBonded && (
        <StakedRow account={account} position={position} onManage={() => setDrawerOpen(true)} />
      )}
      {position.hasUnbonding && (
        <Unstakings account={account} position={position} onClaim={onClaim} />
      )}
      <ManageDrawer
        account={account}
        position={position}
        isOpen={drawerOpen}
        onClose={onCloseDrawer}
        onUnstake={onUnstake}
        onClaim={onClaim}
      />
    </Flex>
  );
}

export default function StakingSection({ account }: { account: AccountLike }) {
  if (account.type !== "Account") return null;
  const aleoAccount = account as AleoAccount;
  if (!isStakingEnabled(aleoAccount)) return null;
  return <Staking account={aleoAccount} />;
}
