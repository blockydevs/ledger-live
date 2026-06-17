export interface Q2WalletV4TourDrawerViewModel {
  readonly isDrawerOpen: boolean;
  readonly openQ2WalletV4Tour: () => void;
  readonly closeQ2WalletV4Tour: () => void;
  readonly onSlideChange: (index: number) => void;
  readonly completeQ2WalletV4Tour: () => void;
}

export type Q2WalletV4TourControls = Q2WalletV4TourDrawerViewModel;
