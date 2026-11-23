import { AccountIdSchema } from "@domain/entity-account";
import type { XrpFamily } from "./types";
import { getManagedTokenAccounts } from "./utils";
import { openXrpDialog } from "./xrpDialog";

const manageAssetsAction: NonNullable<XrpFamily["manageAssetsAction"]> = {
  canManage: account => getManagedTokenAccounts(account).length > 0,
  open: ({ account, dispatch }) => {
    dispatch(openXrpDialog(AccountIdSchema.parse(account.id), { screen: "manageAssets" }));
  },
};

export default manageAssetsAction;
