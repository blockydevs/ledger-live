import type { Account } from "@ledgerhq/types-live";
import type { ParamListBase } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { NavigatorName, ScreenName } from "~/const";
import { getManageableTokenAccounts } from "./utils";

const manageAssetsAction = {
  canManage: (account: Account) => getManageableTokenAccounts(account).length > 0,
  open: (navigation: NativeStackNavigationProp<ParamListBase>, accountId: string) => {
    navigation.navigate(NavigatorName.XrpManageTokenFlow, {
      screen: ScreenName.XrpManageTokenList,
      params: { accountId },
    });
  },
};

export default manageAssetsAction;
