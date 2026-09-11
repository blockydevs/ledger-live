import React, { useMemo } from "react";
import { useTranslation } from "~/context/Locale";
import type { AleoAccount } from "@ledgerhq/live-common/families/aleo/types";
import type { AleoStakingPosition } from "@ledgerhq/live-common/families/aleo/react";
import DelegationDrawer, { type Action } from "~/components/DelegationDrawer";
import UndelegateIcon from "~/icons/Undelegate";
import ClaimRewardIcon from "~/icons/ClaimReward";
import ValidatorImage from "../../cosmos/shared/ValidatorImage";

type Props = {
  account: AleoAccount;
  position: AleoStakingPosition;
  isOpen: boolean;
  onClose: () => void;
  onUnstake: () => void;
  onClaim: () => void;
};

export default function ManageDrawer({
  account,
  position,
  isOpen,
  onClose,
  onUnstake,
  onClaim,
}: Props) {
  const { t } = useTranslation();
  const { hasBonded, claimableBalance, hasPendingUnbondingChange, validatorLabel } = position;

  const canUnstake = hasBonded && !hasPendingUnbondingChange;
  const canClaim = claimableBalance.gt(0) && !hasPendingUnbondingChange;

  const actions = useMemo<Action[]>(
    () => [
      {
        label: t("aleo.manage.unstake"),
        Icon: UndelegateIcon,
        event: "AleoManageUnstake",
        disabled: !canUnstake,
        onPress: onUnstake,
      },
      {
        label: t("aleo.manage.claim"),
        Icon: ClaimRewardIcon,
        event: "AleoManageClaim",
        disabled: !canClaim,
        onPress: onClaim,
      },
    ],
    [t, canUnstake, canClaim, onUnstake, onClaim],
  );

  const data = useMemo(
    () =>
      position.hasPendingUnbondingChange
        ? [
            {
              label: t("aleo.manage.title"),
              Component: position.hasPendingUnbond
                ? t("aleo.manage.unbondPendingInfo")
                : t("aleo.manage.claimPendingInfo"),
            },
          ]
        : [],
    [position.hasPendingUnbondingChange, position.hasPendingUnbond, t],
  );

  return (
    <DelegationDrawer
      isOpen={isOpen}
      onClose={onClose}
      account={account}
      amount={position.bondedBalance}
      ValidatorImage={({ size }) => <ValidatorImage size={size} name={validatorLabel} />}
      data={data}
      actions={actions}
    />
  );
}
