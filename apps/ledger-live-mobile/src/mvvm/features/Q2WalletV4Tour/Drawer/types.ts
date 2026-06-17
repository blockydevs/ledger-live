import type { Q2WalletV4TourImageSource } from "./const";

export interface Q2WalletV4TourDrawerViewModel {
  readonly isDrawerOpen: boolean;
  readonly openQ2WalletV4Tour: () => void;
  readonly closeQ2WalletV4Tour: () => void;
  readonly onSlideChange: (index: number) => void;
  readonly completeQ2WalletV4Tour: () => void;
}

export type Q2WalletV4TourControls = Q2WalletV4TourDrawerViewModel;

export type Q2WalletV4TourResolvedSlide = {
  readonly title: string;
  readonly subtitle: string;
  readonly imageSrc: Q2WalletV4TourImageSource;
};
