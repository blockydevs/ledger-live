import React from "react";
import Animated, { interpolate, useAnimatedStyle } from "react-native-reanimated";
import { useTranslation } from "~/context/Locale";
import { Button } from "@ledgerhq/lumen-ui-rnative";
import { useStyleSheet } from "@ledgerhq/lumen-ui-rnative/styles";
import { useSlideFooterButtonViewModel } from "../hooks/useSlideFooterButtonViewModel";

interface SlideFooterButtonProps {
  readonly onComplete: () => void;
}

export const SlideFooterButton = ({ onComplete }: SlideFooterButtonProps) => {
  const { lastIndex, isFirstSlide, isLastSlide, scrollProgressSharedValue, goNext, complete } =
    useSlideFooterButtonViewModel(onComplete);

  const styles = useStyleSheet(
    () => ({
      container: {
        position: "relative",
      },
      overlay: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      },
    }),
    [],
  );
  const { t } = useTranslation();

  const fadeStart = lastIndex - 0.5;
  const isInTest = process.env.NODE_ENV === "test";
  const primaryLabel = isFirstSlide
    ? t("q2WalletV4Tour.cta.start")
    : t("q2WalletV4Tour.cta.next");

  const continueStyle = useAnimatedStyle(
    () => ({
      opacity: interpolate(
        scrollProgressSharedValue.value,
        [fadeStart, lastIndex],
        [1, 0],
        "clamp",
      ),
    }),
    [fadeStart, lastIndex, scrollProgressSharedValue],
  );

  const doneStyle = useAnimatedStyle(
    () => ({
      opacity: interpolate(
        scrollProgressSharedValue.value,
        [fadeStart, lastIndex],
        [0, 1],
        "clamp",
      ),
    }),
    [fadeStart, lastIndex, scrollProgressSharedValue],
  );

  return (
    <Animated.View style={styles.container}>
      <Animated.View style={continueStyle} pointerEvents={isLastSlide ? "none" : "box-none"}>
        <Button appearance="base" size="lg" onPress={goNext}>
          {primaryLabel}
        </Button>
      </Animated.View>

      <Animated.View
        style={[styles.overlay, doneStyle]}
        pointerEvents={isLastSlide || isInTest ? "box-none" : "none"}
      >
        <Button appearance="base" size="lg" onPress={complete}>
          {t("q2WalletV4Tour.cta.done")}
        </Button>
      </Animated.View>
    </Animated.View>
  );
};
