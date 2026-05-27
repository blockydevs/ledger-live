import { useCallback, useEffect, useRef } from "react";
import { useIsFocused } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFeature } from "@ledgerhq/live-common/featureFlags/index";
import { GenericAwarenessModalLayout } from "@ledgerhq/live-common/genericAwarenessModal";
import { useDispatch, useSelector } from "~/context/hooks";
import { setDismissedContentCard } from "~/actions/settings";
import {
  closeGenericAwarenessModalDrawer,
  markGenericAwarenessModalContentCardAsRead,
  openGenericAwarenessModalDrawer,
  selectGenericAwarenessModalCampaignId,
  selectGenericAwarenessModalContentCards,
  selectCurrentGenericAwarenessModalContentCard,
  selectIsGenericAwarenessModalOpen,
} from "~/reducers/genericAwarenessModal";
import { useGenericAwarenessModalLogic } from "./useGenericAwarenessModalLogic";
import {
  trackGenericAwarenessModalButtonClicked,
  trackGenericAwarenessModalCarouselStepViewed,
  trackGenericAwarenessModalDismissed,
  trackGenericAwarenessModalFeatureIntroViewed,
  trackGenericAwarenessModalMalformedUrl,
  trackGenericAwarenessModalTourCompleted,
} from "../analytics";

export function useGenericAwarenessModalDrawerViewModel() {
  const dispatch = useDispatch();
  const currentCarouselSlideIndexRef = useRef(0);
  const displayedFeatureIntroIdRef = useRef<string | undefined>(undefined);
  const isPortfolioFocused = useIsFocused();
  const { bottom: bottomInset } = useSafeAreaInsets();
  const genericAwarenessModalFlag = useFeature("lwmGenericAwarenessModal");
  const isOpen = useSelector(selectIsGenericAwarenessModalOpen);
  const campaignId = useSelector(selectGenericAwarenessModalCampaignId);
  const cards = useSelector(selectGenericAwarenessModalContentCards);
  const data = useSelector(selectCurrentGenericAwarenessModalContentCard);

  const open = useCallback(
    (campaignId: string) => {
      dispatch(openGenericAwarenessModalDrawer({ campaignId }));
    },
    [dispatch],
  );

  const { shouldMarkAsRead } = useGenericAwarenessModalLogic(
    { campaignId, cards },
    {
      enabled: genericAwarenessModalFlag?.enabled ?? false,
      isFocused: isPortfolioFocused,
      isOpen,
      open,
    },
  );

  useEffect(() => {
    if (!isOpen) {
      displayedFeatureIntroIdRef.current = undefined;
      currentCarouselSlideIndexRef.current = 0;
      return;
    }

    if (
      data?.layout === GenericAwarenessModalLayout.FeatureIntro &&
      displayedFeatureIntroIdRef.current !== data.id
    ) {
      displayedFeatureIntroIdRef.current = data.id;
      trackGenericAwarenessModalFeatureIntroViewed(data);
    }
  }, [data, isOpen]);

  const onFeatureIntroPrimaryPress = useCallback(() => {
    if (data?.layout !== GenericAwarenessModalLayout.FeatureIntro) {
      return;
    }

    trackGenericAwarenessModalButtonClicked(data, data.primaryButtonLabel, {
      ctaPosition: "primary",
      link: data.primaryButtonLink,
    });
  }, [data]);

  const onFeatureIntroSecondaryPress = useCallback(() => {
    if (data?.layout !== GenericAwarenessModalLayout.FeatureIntro) {
      return;
    }

    trackGenericAwarenessModalButtonClicked(data, data.secondaryButtonLabel, {
      ctaPosition: "secondary",
      link: data.secondaryButtonLink,
    });
  }, [data]);

  const onCarouselSlideViewed = useCallback(
    (slideIndex: number, isLastSlide: boolean) => {
      if (data?.layout !== GenericAwarenessModalLayout.Carousel) {
        return;
      }

      currentCarouselSlideIndexRef.current = slideIndex;
      trackGenericAwarenessModalCarouselStepViewed(data, slideIndex);

      if (isLastSlide) {
        trackGenericAwarenessModalTourCompleted(data, slideIndex);
      }
    },
    [data],
  );

  const onCarouselNavigationPress = useCallback(
    (slideIndex: number, button: string) => {
      if (data?.layout !== GenericAwarenessModalLayout.Carousel) {
        return;
      }

      trackGenericAwarenessModalButtonClicked(data, button, {
        ctaPosition: "primary",
        slideIndex,
      });
    },
    [data],
  );

  const onCarouselPrimaryPress = useCallback(
    (slideIndex: number) => {
      if (data?.layout !== GenericAwarenessModalLayout.Carousel) {
        return;
      }

      const slide = data.data[slideIndex];
      if (!slide) {
        return;
      }

      trackGenericAwarenessModalButtonClicked(data, slide.primaryButtonLabel, {
        ctaPosition: "secondary",
        slideIndex,
        link: slide.primaryButtonLink,
      });
    },
    [data],
  );

  const onCarouselMalformedUrl = useCallback(
    (slideIndex: number) => {
      if (data?.layout !== GenericAwarenessModalLayout.Carousel) {
        return;
      }

      trackGenericAwarenessModalMalformedUrl(data, slideIndex);
    },
    [data],
  );

  const onClose = useCallback(() => {
    if (data) {
      trackGenericAwarenessModalDismissed(data, currentCarouselSlideIndexRef.current);
    }

    if (data && shouldMarkAsRead) {
      dispatch(setDismissedContentCard({ [data.id]: Date.now() }));
      dispatch(markGenericAwarenessModalContentCardAsRead({ id: data.id }));
    }

    dispatch(closeGenericAwarenessModalDrawer());
  }, [data, dispatch, shouldMarkAsRead]);

  return {
    isOpen,
    data,
    bottomInset: bottomInset + 20,
    onClose,
    onFeatureIntroPrimaryPress,
    onFeatureIntroSecondaryPress,
    onCarouselSlideViewed,
    onCarouselNavigationPress,
    onCarouselPrimaryPress,
    onCarouselMalformedUrl,
  };
}
