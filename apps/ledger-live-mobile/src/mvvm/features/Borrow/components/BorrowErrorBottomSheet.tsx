import React, { useCallback, useEffect, useRef } from "react";
import {
  BottomSheetView,
  BottomSheetHeader,
  Box,
  Button,
  Spot,
  Text,
} from "@ledgerhq/lumen-ui-rnative";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import QueuedDrawerBottomSheet from "LLM/components/QueuedDrawer/QueuedDrawerBottomSheet";
import { BottomSheetErrorGradient } from "LLM/components/BottomSheetGradient";
import { useSelector } from "~/context/hooks";
import { borrowErrorBottomSheetSelector } from "~/reducers/borrow";
import { resolveBorrowErrorBottomSheet } from "LLM/features/Borrow/handlers/borrowErrorBottomSheetStore";

/**
 * Renders the bottom sheet opened by the Borrow live app via the
 * `custom.bottomSheet.error` wallet-api method.
 *
 * The background is fixed to `BottomSheetErrorGradient`. The wallet-api promise
 * always resolves with `{ confirmed: boolean }`: `true` when the CTA is pressed
 * (onSuccess), `false` when the sheet is closed or dragged down (onError).
 */
export function BorrowErrorBottomSheet() {
  const insets = useSafeAreaInsets();
  const data = useSelector(borrowErrorBottomSheetSelector);
  const isRequestingToBeOpened = !!data;

  // Tracks whether the wallet-api promise has already been settled for the
  // currently displayed sheet so that follow-up close events (e.g. the dismiss
  // animation completing after a CTA press) don't override the outcome.
  const settledRef = useRef(false);
  const activeDataRef = useRef(data);

  useEffect(() => {
    activeDataRef.current = data;

    if (data) {
      settledRef.current = false;
    }
  }, [data]);

  useEffect(() => {
    return () => {
      if (activeDataRef.current && !settledRef.current) {
        settledRef.current = true;
        resolveBorrowErrorBottomSheet(false);
      }
    };
  }, []);

  const handleClose = useCallback(() => {
    if (!settledRef.current) {
      settledRef.current = true;
      resolveBorrowErrorBottomSheet(false);
    }
  }, []);

  const handleConfirm = useCallback(() => {
    if (!settledRef.current) {
      settledRef.current = true;
      resolveBorrowErrorBottomSheet(true);
    }
  }, []);

  return (
    <QueuedDrawerBottomSheet
      isRequestingToBeOpened={isRequestingToBeOpened}
      onClose={handleClose}
      enableDynamicSizing
      backgroundComponent={BottomSheetErrorGradient}
    >
      <BottomSheetView style={{ paddingBottom: insets.bottom }}>
        <BottomSheetHeader />
        {data ? (
          <Box
            lx={{
              alignItems: "center",
              padding: "s16",
              paddingBottom: "s24",
              gap: "s24",
            }}
          >
            <Spot appearance="error" size={72} />
            <Box lx={{ alignItems: "center", gap: "s8" }}>
              <Text typography="heading4SemiBold" lx={{ color: "base", textAlign: "center" }}>
                {data.title}
              </Text>
              <Text typography="body2" lx={{ color: "muted", textAlign: "center" }}>
                {data.description}
              </Text>
            </Box>
            <Button
              appearance="base"
              size="lg"
              onPress={handleConfirm}
              lx={{ width: "full" }}
              testID="borrow-error-bottom-sheet-cta"
            >
              {data.ctaLabel}
            </Button>
          </Box>
        ) : null}
      </BottomSheetView>
    </QueuedDrawerBottomSheet>
  );
}
