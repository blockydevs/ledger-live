import {
  GenericAwarenessModalLayout,
  type GenericAwarenessModalCarousel,
  type GenericAwarenessModalCarouselSlide,
  type GenericAwarenessModalContentCard,
  type GenericAwarenessModalFeatureIntro,
} from "@ledgerhq/live-common/genericAwarenessModal";
import { screen, track } from "~/analytics";

export const GENERIC_AWARENESS_MODAL_FEATURE_INTRO_PAGE = "Awareness Modal Feature Intro";
export const GENERIC_AWARENESS_MODAL_CAROUSEL_PAGE = "Awareness Modal Carousel";

type CtaPosition = "primary" | "secondary";

type ButtonClickedProperties = Readonly<{
  ctaPosition?: CtaPosition;
  slideIndex?: number;
  link?: string;
}>;

const getGenericAwarenessModalPage = (content: GenericAwarenessModalContentCard): string =>
  content.layout === GenericAwarenessModalLayout.Carousel
    ? GENERIC_AWARENESS_MODAL_CAROUSEL_PAGE
    : GENERIC_AWARENESS_MODAL_FEATURE_INTRO_PAGE;

const getCarouselStepProperties = (
  carousel: GenericAwarenessModalCarousel,
  slideIndex: number,
) => ({
  step: slideIndex + 1,
  stepName: carousel.data[slideIndex]?.title ?? "",
  totalSteps: carousel.data.length,
});

export const trackGenericAwarenessModalFeatureIntroViewed = (
  featureIntro: GenericAwarenessModalFeatureIntro,
) => {
  screen(GENERIC_AWARENESS_MODAL_FEATURE_INTRO_PAGE, undefined, {
    name: GENERIC_AWARENESS_MODAL_FEATURE_INTRO_PAGE,
    contentId: featureIntro.id,
  });
};

export const trackGenericAwarenessModalCarouselStepViewed = (
  carousel: GenericAwarenessModalCarousel,
  slideIndex: number,
) => {
  screen(GENERIC_AWARENESS_MODAL_CAROUSEL_PAGE, undefined, {
    name: GENERIC_AWARENESS_MODAL_CAROUSEL_PAGE,
    contentId: carousel.id,
    ...getCarouselStepProperties(carousel, slideIndex),
  });
};

export const trackGenericAwarenessModalButtonClicked = (
  content: GenericAwarenessModalContentCard,
  button: string,
  { ctaPosition, slideIndex, link }: ButtonClickedProperties = {},
) => {
  track("button_clicked", {
    button,
    page: getGenericAwarenessModalPage(content),
    contentId: content.id,
    ...(ctaPosition ? { ctaPosition } : {}),
    ...(link !== undefined ? { link } : {}),
    ...(content.layout === GenericAwarenessModalLayout.Carousel && slideIndex !== undefined
      ? getCarouselStepProperties(content, slideIndex)
      : {}),
  });
};

export const trackGenericAwarenessModalDismissed = (
  content: GenericAwarenessModalContentCard,
  slideIndex?: number,
) => {
  const page = getGenericAwarenessModalPage(content);

  track("drawer_dismissed", {
    drawer: page,
    page,
    contentId: content.id,
    ...(content.layout === GenericAwarenessModalLayout.Carousel && slideIndex !== undefined
      ? getCarouselStepProperties(content, slideIndex)
      : {}),
  });
};

export const trackGenericAwarenessModalTourCompleted = (
  carousel: GenericAwarenessModalCarousel,
  slideIndex: number,
) => {
  track("tour_completed", {
    page: GENERIC_AWARENESS_MODAL_CAROUSEL_PAGE,
    contentId: carousel.id,
    ...getCarouselStepProperties(carousel, slideIndex),
  });
};

export const trackGenericAwarenessModalMalformedUrl = (
  carousel: GenericAwarenessModalCarousel,
  slideIndex: number,
) => {
  track("malformed_url", {
    page: GENERIC_AWARENESS_MODAL_CAROUSEL_PAGE,
    contentId: carousel.id,
    ...getCarouselStepProperties(carousel, slideIndex),
  });
};

export const isGenericAwarenessModalExternalLink = (
  slide: GenericAwarenessModalCarouselSlide,
): boolean => slide.primaryButtonLink.startsWith("http");
