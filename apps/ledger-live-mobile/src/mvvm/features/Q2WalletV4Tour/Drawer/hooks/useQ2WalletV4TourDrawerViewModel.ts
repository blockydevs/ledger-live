import { useState, useCallback, useRef, useEffect } from "react";
import { useFeature } from "@features/platform-feature-flags";
import { useDispatch, useSelector } from "~/context/hooks";
import { setHasSeenQ2WalletV4Tour } from "~/actions/settings";
import { hasSeenQ2WalletV4TourSelector } from "~/reducers/settings";
import { track, screen } from "~/analytics";
import { PAGE_TRACKING_Q2_WALLET_V4_TOUR } from "../const";
import type { Q2WalletV4TourDrawerViewModel } from "../types";

export interface UseQ2WalletV4TourDrawerViewModelOptions {
  /** When true and tour is enabled and not yet seen, the drawer will auto-open (e.g. on Portfolio page). */
  readonly isOnPortfolioPage?: boolean;
}

export const useQ2WalletV4TourDrawerViewModel = (
  options: UseQ2WalletV4TourDrawerViewModelOptions = {},
): Q2WalletV4TourDrawerViewModel => {
  const { isOnPortfolioPage = false } = options;
  const currentIndexRef = useRef(0);
  const isClosingRef = useRef(false);
  const hasSeenQ2WalletV4Tour = useSelector(hasSeenQ2WalletV4TourSelector);
  const lwmWallet40 = useFeature("lwmWallet40");
  const isQ2TourEnabled = (lwmWallet40?.enabled && lwmWallet40?.params?.q2Tour) ?? false;
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const dispatch = useDispatch();

  const handleCloseDialog = useCallback(() => {
    setIsDrawerOpen(false);
    dispatch(setHasSeenQ2WalletV4Tour(true));
  }, [dispatch]);

  const openDrawerWithTracking = useCallback((source: "portfolio" | "debug") => {
    isClosingRef.current = false;
    currentIndexRef.current = 0;
    setIsDrawerOpen(true);
    screen(
      PAGE_TRACKING_Q2_WALLET_V4_TOUR,
      undefined,
      { source: source === "portfolio" ? "Portfolio" : "Debug" },
      true,
      false,
    );
    track("Q2_tour_card", {
      page: PAGE_TRACKING_Q2_WALLET_V4_TOUR,
      card: 1,
    });
  }, []);

  const openQ2WalletV4Tour = useCallback(() => {
    if (!hasSeenQ2WalletV4Tour && isQ2TourEnabled) {
      openDrawerWithTracking("debug");
    }
  }, [hasSeenQ2WalletV4Tour, isQ2TourEnabled, openDrawerWithTracking]);

  const closeQ2WalletV4Tour = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    track("button_clicked", {
      button: "Close",
      page: PAGE_TRACKING_Q2_WALLET_V4_TOUR,
      card: currentIndexRef.current + 1,
    });
    handleCloseDialog();
  }, [handleCloseDialog]);

  const onSlideChange = useCallback((index: number) => {
    currentIndexRef.current = index;
    track("Q2_tour_card", {
      page: PAGE_TRACKING_Q2_WALLET_V4_TOUR,
      card: index + 1,
    });
  }, []);

  const completeQ2WalletV4Tour = useCallback(() => {
    isClosingRef.current = true;
    handleCloseDialog();
  }, [handleCloseDialog]);

  useEffect(() => {
    if (isOnPortfolioPage && isQ2TourEnabled && !hasSeenQ2WalletV4Tour) {
      openDrawerWithTracking("portfolio");
    }
  }, [isOnPortfolioPage, isQ2TourEnabled, hasSeenQ2WalletV4Tour, openDrawerWithTracking]);

  useEffect(() => {
    if (isDrawerOpen && !isQ2TourEnabled) {
      isClosingRef.current = true;
      setIsDrawerOpen(false);
    }
  }, [isDrawerOpen, isQ2TourEnabled]);

  return {
    isDrawerOpen,
    openQ2WalletV4Tour,
    closeQ2WalletV4Tour,
    onSlideChange,
    completeQ2WalletV4Tour,
  };
};
