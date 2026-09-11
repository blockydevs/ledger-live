import React from "react";
import { Flex, Text } from "@ledgerhq/native-ui";
import { useTranslation } from "~/context/Locale";
import type { AleoAccount } from "@ledgerhq/live-common/families/aleo/types";
import type { AleoStakingPosition } from "@ledgerhq/live-common/families/aleo/react";
import Touchable from "~/components/Touchable";
import FirstLetterIcon from "~/components/FirstLetterIcon";
import CurrencyUnitValue from "~/components/CurrencyUnitValue";
import StatusIcon from "./StatusIcon";

type Props = {
  account: AleoAccount;
  position: AleoStakingPosition;
  onManage: () => void;
};

export default function StakedRow({ account, position, onManage }: Props) {
  const { t } = useTranslation();
  const unit = account.currency.units[0];
  const { bondedBalance, validatorLabel, nonEarningReason, estimatedRate } = position;
  const label = validatorLabel || t("aleo.stake.unknownValidator");

  return (
    <Touchable onPress={onManage} event="AleoStakingManage" testID="aleo-staked-row">
      <Flex flexDirection="row" alignItems="center" justifyContent="space-between" py={4}>
        <Flex flexDirection="row" alignItems="center" flex={1} mr={4}>
          <FirstLetterIcon label={label} />
          <Flex ml={3} flex={1}>
            <Text variant="body" fontWeight="semiBold" numberOfLines={1}>
              {label}
            </Text>
            <Text variant="small" color="neutral.c70" testID="aleo-staked-rate">
              {estimatedRate === undefined
                ? "-"
                : t("aleo.stake.estimatedRate", { rate: (estimatedRate * 100).toFixed(1) })}
            </Text>
          </Flex>
        </Flex>
        <Flex flexDirection="row" alignItems="center">
          <StatusIcon nonEarningReason={nonEarningReason} />
          <Text variant="body" fontWeight="semiBold" ml={3} testID="aleo-staked-amount">
            <CurrencyUnitValue unit={unit} value={bondedBalance} showCode />
          </Text>
        </Flex>
      </Flex>
    </Touchable>
  );
}
