import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useNavigation,
  useRoute,
  type ParamListBase,
  type RouteProp,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { Account } from "@ledgerhq/types-live";
import type { AccountSettingsEventHandler } from "@features/flow-account-detail-settings";
import { formatAddress } from "@ledgerhq/live-common/utils/addressUtils";
import { useAccountScreen } from "LLM/hooks/useAccountScreen";
import { useSelector } from "~/context/hooks";
import perFamilyManageAssetsAction from "~/generated/ManageAssetsAction";
import { readOnlyModeEnabledSelector } from "~/reducers/settings";
import { useMaybeAccountName } from "~/reducers/wallet";
import { NavigatorName, ScreenName } from "~/const";
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
  onManageAssets: (() => void) | undefined;
  onViewAdvancedLogs: () => void;
  onConfirmRemove: () => void;
  onSettingsEvent: AccountSettingsEventHandler;
}>;

type SettingsScreen = ScreenName.AccountDetailEditName | ScreenName.AccountDetailAdvancedLogs;

type ManageAssetsAction = Readonly<{
  canManage: (account: Account) => boolean;
  open: (navigation: NativeStackNavigationProp<ParamListBase>, accountId: string) => void;
}>;

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
  const readOnlyModeEnabled = useSelector(readOnlyModeEnabledSelector);
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
  const openAfterSettings = useRef<((accountId: string) => void) | undefined>(undefined);
  const closeSettingsThenOpen = useCallback((open: (accountId: string) => void) => {
    openAfterSettings.current = open;
    setIsSettingsOpen(false);
  }, []);
  const onSettingsHidden = useCallback(() => {
    const open = openAfterSettings.current;
    openAfterSettings.current = undefined;
    if (!open || !mainAccount) return;
    open(mainAccount.id);
  }, [mainAccount]);
  const openSettingsScreen = useCallback(
    (screen: SettingsScreen) => {
      closeSettingsThenOpen(accountId => stackNavigation.navigate(screen, { accountId }));
    },
    [closeSettingsThenOpen, stackNavigation],
  );
  const onChangeName = useCallback(
    () => openSettingsScreen(ScreenName.AccountDetailEditName),
    [openSettingsScreen],
  );
  const onViewAdvancedLogs = useCallback(
    () => openSettingsScreen(ScreenName.AccountDetailAdvancedLogs),
    [openSettingsScreen],
  );

  const manageAssetsAction = mainAccount
    ? (perFamilyManageAssetsAction as Record<string, ManageAssetsAction | undefined>)[
        mainAccount.currency.family
      ]
    : undefined;
  const onManageAssets = useMemo(() => {
    if (readOnlyModeEnabled) return undefined;
    if (!mainAccount || !manageAssetsAction?.canManage(mainAccount)) return undefined;

    return () => {
      closeSettingsThenOpen(accountId => manageAssetsAction.open(navigation, accountId));
    };
  }, [closeSettingsThenOpen, mainAccount, manageAssetsAction, navigation, readOnlyModeEnabled]);

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
    onManageAssets,
    onViewAdvancedLogs,
    onConfirmRemove,
    onSettingsEvent,
  };
}
