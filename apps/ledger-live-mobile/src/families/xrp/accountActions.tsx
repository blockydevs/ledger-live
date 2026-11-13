import React from "react";
import type { Account, AccountLike } from "@ledgerhq/types-live";
import { IconsLegacy } from "@ledgerhq/native-ui";
import { getXrpEnabledTokenStandards } from "@ledgerhq/live-common/families/xrp/config";
import type { XrpTokenAccount } from "@ledgerhq/live-common/families/xrp/types";
import QueuedDrawer from "~/components/QueuedDrawer";
import type {
  ActionButtonEvent,
  ModalOnDisabledClickComponentProps,
} from "~/components/FabActions";
import { NavigatorName, ScreenName } from "~/const";
import { Trans, useTranslation } from "~/context/Locale";
import { hasPendingRemoval } from "./utils";

const REASON_KEYS = {
  pending: {
    title: "xrp.removeToken.disabled.pending.title",
    description: "xrp.removeToken.disabled.pending.description",
  },
  frozen: {
    title: "xrp.removeToken.disabled.frozen.title",
    description: "xrp.removeToken.disabled.frozen.description",
  },
} as const;

function RemoveTokenDisabledDrawer({
  reason,
  isOpen,
  onClose,
}: Readonly<{ reason: keyof typeof REASON_KEYS; isOpen?: boolean; onClose: () => void }>) {
  const { t } = useTranslation();
  const keys = REASON_KEYS[reason];

  return (
    <QueuedDrawer
      isRequestingToBeOpened={!!isOpen}
      onClose={onClose}
      title={t(keys.title)}
      description={t(keys.description)}
    />
  );
}

export function RemovalPendingDrawer({ isOpen, onClose }: ModalOnDisabledClickComponentProps) {
  return <RemoveTokenDisabledDrawer reason="pending" isOpen={isOpen} onClose={onClose} />;
}

export function TokenFrozenDrawer({ isOpen, onClose }: ModalOnDisabledClickComponentProps) {
  return <RemoveTokenDisabledDrawer reason="frozen" isOpen={isOpen} onClose={onClose} />;
}

function getDisabledDrawer(isPending: boolean, isFrozen: boolean) {
  if (isPending) return RemovalPendingDrawer;
  if (isFrozen) return TokenFrozenDrawer;

  return undefined;
}

// Read-only mode drops every family main action, so this one needs no check of its own
const getMainActions = ({
  account,
  parentAccount,
}: {
  account: AccountLike;
  parentAccount?: Account;
}): ActionButtonEvent[] => {
  if (account.type !== "TokenAccount" || !parentAccount) return [];

  // A token account restored without its resources can't be removed until the next sync
  const { xrpResources } = account as XrpTokenAccount;
  if (!xrpResources) return [];

  const enabledStandards: string[] = getXrpEnabledTokenStandards(parentAccount.currency.id);
  if (!enabledStandards.includes(account.token.tokenType)) return [];

  const disabledDrawer = getDisabledDrawer(
    hasPendingRemoval(parentAccount, account.token),
    xrpResources.isLocked,
  );

  return [
    {
      id: "xrp-remove-token",
      label: <Trans i18nKey="xrp.removeToken.cta" />,
      Icon: IconsLegacy.TrashMedium,
      disabled: !!disabledDrawer,
      ...(disabledDrawer && { modalOnDisabledClick: { component: disabledDrawer } }),
      navigationParams: [
        NavigatorName.XrpRemoveTokenFlow,
        {
          screen: ScreenName.XrpRemoveTokenReview,
          params: {
            accountId: account.id,
            parentId: parentAccount.id,
            token: account.token,
          },
        },
      ],
      testId: "xrp-remove-token-action",
    },
  ];
};

export default {
  getMainActions,
};
