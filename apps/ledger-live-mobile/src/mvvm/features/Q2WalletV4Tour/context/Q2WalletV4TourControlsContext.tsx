import React, { createContext, useContext, useMemo } from "react";
import type { Q2WalletV4TourControls } from "../Drawer/types";

export type { Q2WalletV4TourControls };

const Q2WalletV4TourControlsContext = createContext<Q2WalletV4TourControls | null>(null);

type Q2WalletV4TourControlsProviderProps = {
  readonly value: Q2WalletV4TourControls;
  readonly children: React.ReactNode;
};

export const Q2WalletV4TourControlsProvider = ({
  value,
  children,
}: Q2WalletV4TourControlsProviderProps) => {
  const stable = useMemo(
    () => ({
      openQ2WalletV4Tour: value.openQ2WalletV4Tour,
      closeQ2WalletV4Tour: value.closeQ2WalletV4Tour,
      onSlideChange: value.onSlideChange,
      isDrawerOpen: value.isDrawerOpen,
      completeQ2WalletV4Tour: value.completeQ2WalletV4Tour,
    }),
    [
      value.openQ2WalletV4Tour,
      value.closeQ2WalletV4Tour,
      value.onSlideChange,
      value.isDrawerOpen,
      value.completeQ2WalletV4Tour,
    ],
  );

  return (
    <Q2WalletV4TourControlsContext.Provider value={stable}>
      {children}
    </Q2WalletV4TourControlsContext.Provider>
  );
};

export const useQ2WalletV4TourControls = (): Q2WalletV4TourControls => {
  const ctx = useContext(Q2WalletV4TourControlsContext);
  if (ctx == null) {
    throw new Error("useQ2WalletV4TourControls must be used within Q2WalletV4TourControlsProvider");
  }
  return ctx;
};
