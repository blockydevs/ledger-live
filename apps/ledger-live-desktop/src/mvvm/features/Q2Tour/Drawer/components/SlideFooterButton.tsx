import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@ledgerhq/lumen-ui-react";
import { useSlidesContext } from "LLD/components/Slides";
import { Q2_TOUR_SLIDES } from "../const";

interface SlideFooterButtonProps {
  readonly onContinueClick: (slideIndex: number, isLastSlide: boolean) => void;
  readonly onComplete: () => void;
}

export function SlideFooterButton({ onContinueClick, onComplete }: SlideFooterButtonProps) {
  const { currentIndex, totalSlides, goToNext } = useSlidesContext();
  const { t } = useTranslation();

  const isLastSlide = currentIndex === totalSlides - 1;
  const ctaKey = Q2_TOUR_SLIDES[currentIndex]?.ctaKey ?? "q2Tour.cta.next";

  const handleClick = () => {
    onContinueClick(currentIndex, isLastSlide);

    if (isLastSlide) {
      onComplete();
      return;
    }

    goToNext();
  };

  return (
    <div className="flex flex-col gap-16">
      <Button appearance="gray" size="lg" isFull onClick={handleClick}>
        {t(ctaKey)}
      </Button>
    </div>
  );
}
