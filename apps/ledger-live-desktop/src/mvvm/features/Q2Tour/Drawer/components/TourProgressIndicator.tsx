import React from "react";
import { PageIndicator } from "@ledgerhq/lumen-ui-react";
import { useSlidesContext } from "LLD/components/Slides";

export function TourProgressIndicator() {
  const { currentIndex, totalSlides } = useSlidesContext();

  return (
    <div className="flex justify-center py-24">
      <PageIndicator currentPage={currentIndex + 1} totalPages={totalSlides} />
    </div>
  );
}
