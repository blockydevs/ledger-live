import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { Account } from "@ledgerhq/types-live";
import type { AccountSettingsEventHandler } from "@features/flow-account-detail-settings";
import { formatAddress } from "@ledgerhq/live-common/utils/addressUtils";
import { useAccountScreen } from "LLM/hooks/useAccountScreen";
import { useMaybeAccountName } from "~/reducers/wallet";
import { NavigatorName, ScreenName } from "~/const";
import { getManageAssetsScreen } from "~/screens/AccountSettings/getManageAssetsScreen";
import type { BaseNavigatorStackParamList } from "~/components/RootNavigator/types/BaseNavigator";
import type {
  RootNavigationComposite,
  StackNavigatorNavigation,
} from "~/components/RootNavigator/types/helpers";
import type { AccountDetailNavigatorParamsList } from "../../types";
import { useAccountSettingsTracking } from "../../hooks/useAccountSettingsTracking";
import { useAccountRefresh, type AccountRefresh } from "./useAccountRefresh";
import { useDeferredAccountRemoval } from "./useDeferredAccountRemoval";

export type AccountDetailHeader = Readonly<{
  title: string;
  address: string;
  ledgerId: string;
  ticker: string;
}>;

export type AccountDetailViewModel = Readonly<{
  account: Account | undefined;
  accountName: string;
  header: AccountDetailHeader | undefined;
  refresh: AccountRefresh;
  onOpenSettings: () => void;
  isSettingsOpen: boolean;
  onCloseSettings: () => void;
  onSettingsHidden: () => void;
  onChangeName: () => void;
  onViewAdvancedLogs: () => void;
  onManageAssets?: () => void;
  onConfirmRemove: () => void;
  onSettingsEvent: AccountSettingsEventHandler;
}>;

type SettingsScreen = ScreenName.AccountDetailEditName | ScreenName.AccountDetailAdvancedLogs;

type AccountDetailRoute = RouteProp<AccountDetailNavigatorParamsList, ScreenName.AccountDetail>;
type AccountDetailNavigation = RootNavigationComposite<
  StackNavigatorNavigation<BaseNavigatorStackParamList>
>;
type AccountDetailStackNavigation = NativeStackNavigationProp<
  AccountDetailNavigatorParamsList,
  ScreenName.AccountDetail
>;

export function useAccountDetailViewModel(): AccountDetailViewModel {
  const route = useRoute<AccountDetailRoute>();
  const navigation = useNavigation<AccountDetailNavigation>();
  const stackNavigation = useNavigation<AccountDetailStackNavigation>();
  const { account } = useAccountScreen(route);
  const mainAccount = account?.type === "Account" ? account : undefined;

  const removeAccount = useDeferredAccountRemoval(mainAccount);
  const refresh = useAccountRefresh(mainAccount);

  useEffect(() => {
    if (mainAccount) return;
    navigation.navigate(NavigatorName.Base, {
      screen: NavigatorName.Main,
      params: { screen: NavigatorName.Portfolio, params: { screen: ScreenName.Portfolio } },
    });
  }, [mainAccount, navigation]);

  const accountName = useMaybeAccountName(mainAccount);
  const header = useMemo(
    () =>
      mainAccount && accountName
        ? {
            title: accountName,
            address: formatAddress(mainAccount.freshAddress, { prefixLength: 4, suffixLength: 4 }),
            ledgerId: mainAccount.currency.id,
            ticker: mainAccount.currency.ticker,
          }
        : undefined,
    [mainAccount, accountName],
  );

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { onSettingsEvent, onSettingsOpened } = useAccountSettingsTracking(mainAccount);
  const onOpenSettings = useCallback(() => {
    onSettingsOpened();
    setIsSettingsOpen(true);
  }, [onSettingsOpened]);
  const onCloseSettings = useCallback(() => setIsSettingsOpen(false), []);
  const openAfterSettings = useRef<(() => void) | undefined>(undefined);
  const closeSettingsThenOpen = useCallback((open: () => void) => {
    openAfterSettings.current = open;
    setIsSettingsOpen(false);
  }, []);
  const onSettingsHidden = useCallback(() => {
    const open = openAfterSettings.current;
    openAfterSettings.current = undefined;
    open?.();
  }, []);
  const openSettingsScreen = useCallback(
    (screen: SettingsScreen) => {
      if (!mainAccount) return;
      const accountId = mainAccount.id;
      closeSettingsThenOpen(() => stackNavigation.navigate(screen, { accountId }));
    },
    [closeSettingsThenOpen, mainAccount, stackNavigation],
  );
  const onChangeName = useCallback(
    () => openSettingsScreen(ScreenName.AccountDetailEditName),
    [openSettingsScreen],
  );
  const onViewAdvancedLogs = useCallback(
    () => openSettingsScreen(ScreenName.AccountDetailAdvancedLogs),
    [openSettingsScreen],
  );
  const manageAssetsScreen = mainAccount && getManageAssetsScreen(mainAccount);
  const onManageAssets = useMemo(() => {
    if (!manageAssetsScreen || !mainAccount) return undefined;
    const accountId = mainAccount.id;

    return () =>
      closeSettingsThenOpen(() => navigation.navigate(manageAssetsScreen, { accountId }));
  }, [closeSettingsThenOpen, mainAccount, manageAssetsScreen, navigation]);

  const onConfirmRemove = useCallback(() => {
    setIsSettingsOpen(false);
    removeAccount();
  }, [removeAccount]);

  return {
    account: mainAccount,
    accountName: accountName ?? "",
    header,
    refresh,
    onOpenSettings,
    isSettingsOpen,
    onCloseSettings,
    onSettingsHidden,
    onChangeName,
    onViewAdvancedLogs,
    onManageAssets,
    onConfirmRemove,
    onSettingsEvent,
  };
}
