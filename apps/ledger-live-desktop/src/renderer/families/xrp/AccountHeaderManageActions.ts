import { useTranslation } from "react-i18next";
import { useDispatch } from "LLD/hooks/redux";
import IconAccountSettings from "~/renderer/icons/AccountSettings";
import manageAssetsAction from "./manageAssetsAction";
import type { XrpFamily } from "./types";

const AccountHeaderManageActions: XrpFamily["accountHeaderManageActions"] = ({ account }) => {
  const dispatch = useDispatch();
  const { t } = useTranslation();

  if (account.type !== "Account") return [];
  if (!manageAssetsAction.canManage(account)) return [];

  return [
    {
      key: "ManageAssets",
      label: t("xrp.manageAssets.cta"),
      icon: IconAccountSettings,
      accountActionsTestId: "xrp-manage-assets",
      onClick: () => manageAssetsAction.open({ account, dispatch }),
    },
  ];
};

export default AccountHeaderManageActions;
