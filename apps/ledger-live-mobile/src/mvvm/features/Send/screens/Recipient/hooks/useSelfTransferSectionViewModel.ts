import { useCallback } from "react";
import type { BalanceTypeSelfTransferTarget } from "@ledgerhq/live-common/bridge/descriptor/types";
import { useTranslation } from "~/context/Locale";

type UseSelfTransferSectionViewModelProps = Readonly<{
  target: BalanceTypeSelfTransferTarget | null;
  onAddressSelected: (address: string) => void;
}>;

export type SelfTransferSectionViewModel = Readonly<{
  title: string;
  actionLabel: string;
  isDestinationPublic: boolean;
  onPress: () => void;
}> | null;

export function useSelfTransferSectionViewModel({
  target,
  onAddressSelected,
}: UseSelfTransferSectionViewModelProps): SelfTransferSectionViewModel {
  const { t } = useTranslation();

  const onPress = useCallback(() => {
    if (target) onAddressSelected(target.address);
  }, [target, onAddressSelected]);

  if (!target) return null;

  return {
    title: t("send.newSendFlow.recipient.selfTransfer.title"),
    actionLabel: t(`send.newSendFlow.${target.translationKey}.action`),
    isDestinationPublic: target.isDestinationPublic,
    onPress,
  };
}
