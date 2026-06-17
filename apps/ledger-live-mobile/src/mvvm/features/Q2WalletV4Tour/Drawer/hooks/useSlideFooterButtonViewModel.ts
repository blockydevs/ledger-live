import { useCallback } from "react";
import { useSlidesContext } from "@ledgerhq/native-ui";
import { track } from "~/analytics";
import { PAGE_TRACKING_Q2_WALLET_V4_TOUR } from "../const";

export const useSlideFooterButtonViewModel = (onComplete: () => void) => {
  const { totalSlides, currentIndex, goToNext, scrollProgressSharedValue } = useSlidesContext();

  const lastIndex = totalSlides - 1;
  const isFirstSlide = currentIndex <= 0;
  const isLastSlide = currentIndex >= lastIndex;

  const goNext = useCallback(() => {
    goToNext();
    track("button_clicked", {
      button: "Next",
      page: PAGE_TRACKING_Q2_WALLET_V4_TOUR,
      card: currentIndex + 1,
    });
  }, [currentIndex, goToNext]);

  const complete = useCallback(() => {
    onComplete();
    track("button_clicked", {
      button: "Discover my new portfolio",
      page: PAGE_TRACKING_Q2_WALLET_V4_TOUR,
    });
  }, [onComplete]);

  return {
    lastIndex,
    isFirstSlide,
    isLastSlide,
    scrollProgressSharedValue,
    goNext,
    complete,
  };
};
