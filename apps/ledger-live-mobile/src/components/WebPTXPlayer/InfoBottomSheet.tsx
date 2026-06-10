import React from "react";
import { BottomSheetView, BottomSheetHeader, Text } from "@ledgerhq/lumen-ui-rnative";
import { Linking } from "react-native";
import type { ValidatedInfoDialogParams } from "@ledgerhq/live-common/wallet-api/validation/validateInfoDialogParams";
import QueuedDrawerBottomSheet from "LLM/components/QueuedDrawer/QueuedDrawerBottomSheet";

type InfoBottomSheetProps = Readonly<{
  data: ValidatedInfoDialogParams | undefined;
  onClose: () => void;
}>;

export function InfoBottomSheet({ data, onClose }: InfoBottomSheetProps) {
  const isRequestingToBeOpened = !!data;
  const title = data?.title;
  const message = data?.message;
  const linkText = data?.linkText;
  const linkHref = data?.linkHref;

  const showInlineLink = Boolean(linkText && linkHref);

  const onLinkPress = () => {
    if (linkHref) {
      Linking.openURL(linkHref);
    }
  };

  return (
    <QueuedDrawerBottomSheet
      isRequestingToBeOpened={isRequestingToBeOpened}
      onClose={onClose}
      enableDynamicSizing
    >
      <BottomSheetView>
        <BottomSheetHeader />
        <Text typography="heading3SemiBold" lx={{ color: "base", marginBottom: "s12" }}>
          {title}
        </Text>
        <Text typography="body1" lx={{ color: "base", marginBottom: "s24" }}>
          {message}
          {showInlineLink ? " " : null}
          {showInlineLink ? (
            <Text typography="body1" lx={{ color: "interactive" }} onPress={onLinkPress}>
              {linkText}
            </Text>
          ) : null}
        </Text>
      </BottomSheetView>
    </QueuedDrawerBottomSheet>
  );
}
