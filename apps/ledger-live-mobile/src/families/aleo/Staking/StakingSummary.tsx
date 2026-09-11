import React from "react";
import BigNumber from "bignumber.js";
import { Flex, Text } from "@ledgerhq/native-ui";
import { useTranslation } from "~/context/Locale";
import type { AleoAccount } from "@ledgerhq/live-common/families/aleo/types";
import type { AleoStakingPosition } from "@ledgerhq/live-common/families/aleo/react";
import CurrencyUnitValue from "~/components/CurrencyUnitValue";

type Props = {
  account: AleoAccount;
  position: AleoStakingPosition;
};

export default function StakingSummary({ account, position }: Props) {
  const { t } = useTranslation();
  const unit = account.currency.units[0];
  const { bondedBalance, unbondingBalance, claimableBalance } = position;

  return (
    <Flex flexDirection="row" justifyContent="space-between" py={4}>
      <Cell
        label={t("aleo.stake.staked")}
        value={bondedBalance}
        unit={unit}
        testID="aleo-summary-staked"
      />
      <Cell
        label={t("aleo.stake.unstaking")}
        value={unbondingBalance.minus(claimableBalance)}
        unit={unit}
        testID="aleo-summary-unstaking"
      />
      <Cell
        label={t("aleo.stake.claimable")}
        value={claimableBalance}
        unit={unit}
        testID="aleo-summary-claimable"
      />
    </Flex>
  );
}

function Cell({
  label,
  value,
  unit,
  testID,
}: {
  label: string;
  value: BigNumber;
  unit: AleoAccount["currency"]["units"][number];
  testID: string;
}) {
  return (
    <Flex flex={1}>
      <Text variant="small" color="neutral.c70">
        {label}
      </Text>
      <Text variant="body" fontWeight="semiBold" testID={testID}>
        <CurrencyUnitValue unit={unit} value={value} showCode />
      </Text>
    </Flex>
  );
}
