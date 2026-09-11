import React from "react";
import { Flex, Text } from "@ledgerhq/native-ui";
import { useTranslation } from "~/context/Locale";
import {
  useSyncOnUnbondingComplete,
  type AleoStakingPosition,
} from "@ledgerhq/live-common/families/aleo/react";
import { getUnbondingDisplayState } from "@ledgerhq/live-common/families/aleo/stakingDisplay";
import type { AleoAccount } from "@ledgerhq/live-common/families/aleo/types";
import CurrencyUnitValue from "~/components/CurrencyUnitValue";
import Button from "~/components/wrappedUi/Button";
import { useAleoLiveBlockHeight } from "../hooks/useAleoLiveBlockHeight";

type Props = {
  account: AleoAccount;
  position: AleoStakingPosition;
  onClaim: () => void;
};

export default function Unstakings({ account, position, onClaim }: Props) {
  const { t } = useTranslation();
  const unit = account.currency.units[0];

  // The poll must be enabled before its height exists, so the countdown flag is read from the
  // synced height first and the full state is derived once the live height is in.
  const { isCountingDown } = getUnbondingDisplayState({
    position,
    syncedHeight: account.blockHeight,
    currentHeight: account.blockHeight,
  });
  const currentHeight = useAleoLiveBlockHeight(account.currency, {
    fallbackHeight: account.blockHeight,
    enabled: isCountingDown,
  });
  const { isClaimable, isSettling, blocksLeft } = getUnbondingDisplayState({
    position,
    syncedHeight: account.blockHeight,
    currentHeight,
  });
  useSyncOnUnbondingComplete(account.id, isSettling);

  const { unbondingBalance, hasPendingClaim, hasPendingUnbondingChange } = position;

  return (
    <Flex flexDirection="row" alignItems="center" justifyContent="space-between" py={4}>
      <Flex>
        <Text variant="body" fontWeight="semiBold" testID="aleo-unstaking-amount">
          <CurrencyUnitValue unit={unit} value={unbondingBalance} showCode />
        </Text>
        <Text variant="small" color="neutral.c70">
          {t("aleo.stake.unstakingRow.title")}
        </Text>
      </Flex>
      {hasPendingUnbondingChange ? (
        <Text variant="small" color="neutral.c70" testID="aleo-unstaking-pending">
          {hasPendingClaim
            ? t("aleo.stake.unstakingRow.claimPending")
            : t("aleo.stake.unstakingRow.unbondPending")}
        </Text>
      ) : isClaimable ? (
        <Button type="main" outline onPress={onClaim} testID="aleo-unstaking-claim">
          {t("aleo.stake.unstakingRow.claim")}
        </Button>
      ) : isSettling ? (
        <Text variant="small" color="neutral.c70" testID="aleo-unstaking-settling">
          {t("aleo.stake.unstakingRow.settling")}
        </Text>
      ) : (
        <Text variant="small" color="neutral.c70" testID="aleo-unstaking-countdown">
          {blocksLeft != null
            ? t("aleo.stake.unstakingRow.blocksRemaining", { count: blocksLeft })
            : "-"}
        </Text>
      )}
    </Flex>
  );
}
