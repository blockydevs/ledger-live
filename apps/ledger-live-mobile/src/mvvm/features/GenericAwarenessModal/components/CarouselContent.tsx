import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Slides, useSlidesContext } from "@ledgerhq/native-ui";
import { StyleSheet } from "react-native";
import { FlatList } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import type { GenericAwarenessModalCarouselSlide } from "@ledgerhq/live-common/genericAwarenessModal";
import { CarouselFooterButton } from "./CarouselFooterButton";
import { CarouselProgressIndicator } from "./CarouselProgressIndicator";
import { CarouselSlideItem } from "./CarouselSlideItem";

type CarouselContentProps = Readonly<{
  slides: GenericAwarenessModalCarouselSlide[];
  onClose: () => void;
  onSlideViewed: (slideIndex: number, isLastSlide: boolean) => void;
  onNavigationPress: (slideIndex: number, button: string, isLastSlide: boolean) => void;
  onPrimaryPress: (slideIndex: number) => void;
  onMalformedUrl: (slideIndex: number) => void;
}>;

const AnimatedGestureHandlerFlatList = Animated.createAnimatedComponent(FlatList);

const DEFAULT_LINE_COUNT = 1;

export function CarouselContent({
  slides,
  onClose,
  onSlideViewed,
  onNavigationPress,
  onPrimaryPress,
  onMalformedUrl,
}: CarouselContentProps) {
  const [titleLineCounts, setTitleLineCounts] = useState<number[]>(() =>
    slides.map(() => DEFAULT_LINE_COUNT),
  );
  const [subtitleLineCounts, setSubtitleLineCounts] = useState<number[]>(() =>
    slides.map(() => DEFAULT_LINE_COUNT),
  );

  const maxTitleLineCount = useMemo(
    () => Math.max(DEFAULT_LINE_COUNT, ...titleLineCounts),
    [titleLineCounts],
  );
  const maxSubtitleLineCount = useMemo(
    () => Math.max(DEFAULT_LINE_COUNT, ...subtitleLineCounts),
    [subtitleLineCounts],
  );

  const handleTitleTextLayout = useCallback((slideIndex: number, lineCount: number) => {
    setTitleLineCounts(currentTitleLineCounts => {
      const nextTitleLineCounts = [...currentTitleLineCounts];
      const currentLineCount = nextTitleLineCounts[slideIndex] ?? DEFAULT_LINE_COUNT;

      nextTitleLineCounts[slideIndex] = Math.max(currentLineCount, lineCount);
      return nextTitleLineCounts;
    });
  }, []);

  const handleSubtitleTextLayout = useCallback((slideIndex: number, lineCount: number) => {
    setSubtitleLineCounts(currentSubtitleLineCounts => {
      const nextSubtitleLineCounts = [...currentSubtitleLineCounts];
      const currentLineCount = nextSubtitleLineCounts[slideIndex] ?? DEFAULT_LINE_COUNT;

      nextSubtitleLineCounts[slideIndex] = Math.max(currentLineCount, lineCount);
      return nextSubtitleLineCounts;
    });
  }, []);

  return (
    <Slides
      style={{ flex: 1 }}
      as={AnimatedGestureHandlerFlatList}
      testID="generic-awareness-modal-carousel-slides"
    >
      <Slides.Content style={{ flex: 1 }}>
        {slides.map((slide, slideIndex) => (
          <Slides.Content.Item key={slideIndex}>
            <CarouselSlideItem
              {...slide}
              isFirstSlide={slideIndex === 0}
              titleLineCount={maxTitleLineCount}
              onTitleTextLayout={lineCount => handleTitleTextLayout(slideIndex, lineCount)}
              subtitleLineCount={maxSubtitleLineCount}
              onSubtitleTextLayout={lineCount => handleSubtitleTextLayout(slideIndex, lineCount)}
            />
          </Slides.Content.Item>
        ))}
      </Slides.Content>

      <Slides.ProgressIndicator style={styles.progressIndicator}>
        <CarouselProgressIndicator />
      </Slides.ProgressIndicator>

      <Slides.Footer>
        <CarouselSlideViewedTracker onSlideViewed={onSlideViewed} />
        <CarouselFooterButton
          slides={slides}
          onClose={onClose}
          onNavigationPress={onNavigationPress}
          onPrimaryPress={onPrimaryPress}
          onMalformedUrl={onMalformedUrl}
        />
      </Slides.Footer>
    </Slides>
  );
}

type CarouselSlideViewedTrackerProps = Readonly<{
  onSlideViewed: (slideIndex: number, isLastSlide: boolean) => void;
}>;

function CarouselSlideViewedTracker({ onSlideViewed }: CarouselSlideViewedTrackerProps) {
  const { currentIndex, totalSlides } = useSlidesContext();

  useEffect(() => {
    onSlideViewed(currentIndex, currentIndex === totalSlides - 1);
  }, [currentIndex, onSlideViewed, totalSlides]);

  return null;
}

const styles = StyleSheet.create({
  progressIndicator: {
    marginTop: 24,
    marginBottom: 24,
  },
});
