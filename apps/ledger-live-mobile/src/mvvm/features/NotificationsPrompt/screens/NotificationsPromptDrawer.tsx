import React from "react";
import { useTranslation } from "~/context/Locale";
import { Flex, Link as TextLink, Button } from "@ledgerhq/native-ui";
import { useNotifications } from "LLM/features/NotificationsPrompt";
import QueuedDrawer from "LLM/components/QueuedDrawer";
import { NotificationsDrawerIllustration } from "LLM/features/NotificationsPrompt/components/NotificationsDrawerIllustration";
import { NotificationsPromptContent } from "LLM/features/NotificationsPrompt/components/NotificationsPromptContent";
import { getNotificationsPromptCopy } from "LLM/features/NotificationsPrompt/utils/getNotificationsPromptCopy";
import { TrackScreen } from "~/analytics";
import { useFeature } from "@features/platform-feature-flags";
import { AB_TESTING_VARIANTS } from "LLM/features/NotificationsPrompt/types/variants";

export const NotificationsPromptDrawer = () => {
  const { t } = useTranslation();
  const {
    drawerSource,
    drawerPromptTarget,
    isPushNotificationsModalOpen,
    handleAllowNotificationsPress,
    handleDelayLaterPress,
    handleCloseFromBackdropPress,
    nextRepromptDelay,
    pushNotificationsDataOfUser,
  } = useNotifications();

  const featureNewWordingNotificationsDrawer = useFeature("lwmNewWordingOptInNotificationsDrawer");

  const canShowVariant = featureNewWordingNotificationsDrawer?.enabled;
  const isVariantB =
    featureNewWordingNotificationsDrawer?.enabled === true &&
    featureNewWordingNotificationsDrawer?.params?.variant === AB_TESTING_VARIANTS.B;
  const { allowKey, laterKey } = getNotificationsPromptCopy(drawerPromptTarget, isVariantB);

  return (
    <QueuedDrawer
      isRequestingToBeOpened={isPushNotificationsModalOpen}
      noCloseButton
      onBackdropPress={handleCloseFromBackdropPress}
    >
      <TrackScreen
        category="Drawer push notification opt-in"
        source={drawerSource}
        promptTarget={drawerPromptTarget}
        repromptDelay={nextRepromptDelay}
        dismissedCount={pushNotificationsDataOfUser?.dismissedOptInDrawerAtList?.length ?? 0}
        variant={canShowVariant ? featureNewWordingNotificationsDrawer?.params?.variant : undefined}
      />

      <Flex mb={4}>
        <Flex alignItems={"center"}>
          <NotificationsDrawerIllustration type={drawerSource} />
          <NotificationsPromptContent promptTarget={drawerPromptTarget} />
        </Flex>
        <Button
          type={"main"}
          mt={8}
          mb={7}
          onPressIn={handleAllowNotificationsPress}
          testID="notifications-prompt-allow"
        >
          {t(allowKey)}
        </Button>
        <TextLink
          type={"shade"}
          onPressIn={handleDelayLaterPress}
          testID="notifications-prompt-later"
        >
          {t(laterKey)}
        </TextLink>
      </Flex>
    </QueuedDrawer>
  );
};
