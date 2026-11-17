import type { AccountSettingsEventHandler } from "../../logic/accountSettingsEvent";

export type AccountSettingsMenuProps = Readonly<{
  accountName: string;
  onEvent?: AccountSettingsEventHandler;
  explorerUrl?: string;
  onChangeName: () => void;
  /** Shows the row, for an account whose assets the app can manage (e.g. XRP tokens) */
  onManageAssets?: () => void;
  onViewAdvancedLogs: () => void;
  onRemoveAccount: () => void;
}>;

export type AccountSettingsMenuLabels = Readonly<{
  changeName: string;
  manageAssets: string;
  viewAdvancedLogs: string;
  viewExplorer: string;
  removeAccount: string;
}>;

export type AccountSettingsMenuViewProps = Omit<AccountSettingsMenuProps, "explorerUrl"> &
  Readonly<{ labels: AccountSettingsMenuLabels; onViewExplorer?: () => void }>;
