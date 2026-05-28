import { useCallback, useMemo } from "react";
import { useDispatch } from "LLD/hooks/redux";
import {
  GenericAwarenessModalLayout,
  type GenericAwarenessModalCarouselSlide,
  type GenericAwarenessModalContentCard,
} from "@ledgerhq/live-common/genericAwarenessModal";
import { closeGenericAwarenessModalDialog } from "../genericAwarenessModalDialog";
import { openURL } from "~/renderer/linking";

export interface GenericAwarenessModalCarouselViewModel {
  slides: GenericAwarenessModalCarouselSlide[];
  onSlidePrimaryClick: (slide: GenericAwarenessModalCarouselSlide) => void;
  onClose: () => void;
}

const useGenericAwarenessModalCarouselViewModel = (
  contentCard: GenericAwarenessModalContentCard | undefined,
): GenericAwarenessModalCarouselViewModel => {
  const dispatch = useDispatch();

  const carousel =
    contentCard?.layout === GenericAwarenessModalLayout.Carousel ? contentCard : undefined;

  const onClose = useCallback(() => {
    dispatch(closeGenericAwarenessModalDialog());
  }, [dispatch]);

  const onSlidePrimaryClick = useCallback(
    (slide: GenericAwarenessModalCarouselSlide) => {
      openURL(slide.primaryButtonLink);
      onClose();
    },
    [onClose],
  );

  return useMemo(
    () => ({
      slides: carousel?.data ?? [],
      onSlidePrimaryClick,
      onClose,
    }),
    [carousel, onClose, onSlidePrimaryClick],
  );
};

export default useGenericAwarenessModalCarouselViewModel;
