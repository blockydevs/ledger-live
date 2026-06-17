import React, { useCallback, useState } from "react";
import { Image, Platform, type LayoutChangeEvent } from "react-native";
import { useSlidesContext } from "@ledgerhq/native-ui";
import { Box, Text } from "@ledgerhq/lumen-ui-rnative";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
} from "react-native-reanimated";
import { useTheme } from "styled-components/native";
import { useStyleSheet } from "@ledgerhq/lumen-ui-rnative/styles";
import type { Q2WalletV4TourImageSource } from "../const";

type SlideItemProps = Readonly<{
  title: string;
  subtitle: string;
  imageSrc: Q2WalletV4TourImageSource;
  index: number;
}>;

export function SlideItem({ title, subtitle, index, imageSrc }: SlideItemProps) {
  const { scrollProgressSharedValue, currentIndex } = useSlidesContext();
  const { theme } = useTheme();
  const source = theme === "dark" ? imageSrc.dark : imageSrc.light;
  const styles = useStyleSheet(
    () => ({
      image: {
        width: "100%",
        height: "100%",
      },
    }),
    [],
  );

  const [slideWidth, setSlideWidth] = useState(0);

  const handleLayout = useCallback(({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    setSlideWidth(layout.width);
  }, []);

  const reduceMotion = useReducedMotion();

  const animatedStyle = useAnimatedStyle(() => {
    if (reduceMotion) {
      return {};
    }

    const progress = scrollProgressSharedValue.value;
    const THRESHOLD = 0.6;
    const opacity = interpolate(
      progress,
      [index - THRESHOLD, index, index + THRESHOLD],
      [0, 1, 0],
      Extrapolation.CLAMP,
    );

    const translateX = interpolate(
      progress,
      [index - THRESHOLD, index, index + THRESHOLD],
      Platform.OS === "android"
        ? [-slideWidth * 0.05, 0, slideWidth * 0.05]
        : [-slideWidth * 0.2, 0, slideWidth * 0.2],
      Extrapolation.CLAMP,
    );

    const scale = interpolate(
      progress,
      [index - THRESHOLD, index, index + THRESHOLD],
      [0.98, 1, 0.98],
      Extrapolation.CLAMP,
    );

    return {
      opacity,
      transform: [{ translateX }, { scale }],
    };
  }, [index, slideWidth, scrollProgressSharedValue, reduceMotion]);

  const textAnimatedStyle = useAnimatedStyle(() => {
    if (reduceMotion) {
      return {};
    }

    const progress = scrollProgressSharedValue.value;
    const STAGGER_THRESHOLD = 0.5;

    const opacity = interpolate(
      progress,
      [index - 1 + STAGGER_THRESHOLD, index, index + 1 - STAGGER_THRESHOLD],
      [0, 1, 0],
      Extrapolation.CLAMP,
    );

    const translateX = interpolate(
      progress,
      [index - STAGGER_THRESHOLD, index, index + STAGGER_THRESHOLD],
      [slideWidth * 0.05, 0, -slideWidth * 0.05],
      Extrapolation.CLAMP,
    );

    return {
      opacity,
      transform: [{ translateX }],
    };
  }, [index, slideWidth, scrollProgressSharedValue, reduceMotion]);

  const shouldRender = Math.abs(currentIndex - index) <= 1;

  return (
    <Animated.View onLayout={handleLayout} style={[animatedStyle, { flex: 1 }]}>
      <Box lx={{ flex: 1 }}>
        {shouldRender ? (
          <Image source={source} style={styles.image} resizeMode="contain" />
        ) : null}
      </Box>

      <Animated.View style={textAnimatedStyle} pointerEvents="none">
        <Box
          lx={{
            justifyContent: "center",
            minHeight: "s80",
          }}
        >
          <Text
            typography="heading3SemiBold"
            lx={{
              textAlign: "center",
              color: "base",
              marginBottom: "s8",
            }}
            numberOfLines={2}
          >
            {title}
          </Text>
        </Box>

        {subtitle ? (
          <Text
            typography="body2"
            lx={{
              color: "muted",
              textAlign: "center",
            }}
            numberOfLines={3}
          >
            {subtitle}
          </Text>
        ) : null}
      </Animated.View>
    </Animated.View>
  );
}
