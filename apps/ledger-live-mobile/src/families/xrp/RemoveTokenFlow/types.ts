import type { TokenCurrency } from "@domain/entity-currency-token";
import type { Transaction, TransactionStatus } from "@ledgerhq/live-common/families/xrp/types";
import type { Device } from "@ledgerhq/live-common/hw/actions/types";
import type { Operation } from "@ledgerhq/types-live";
import { ScreenName } from "~/const";

type SignParams = {
  accountId: string;
  tokenAccountId: string;
  token: TokenCurrency;
  parentId?: string;
  transaction: Transaction;
  status: TransactionStatus;
};

export type XrpRemoveTokenFlowParamList = {
  [ScreenName.XrpRemoveTokenReview]: {
    /** The token account: FabActions overrides `accountId` and `parentId` with these anyway */
    accountId: string;
    parentId: string;
    token: TokenCurrency;
  };
  [ScreenName.XrpRemoveTokenSelectDevice]: SignParams;
  [ScreenName.XrpRemoveTokenConnectDevice]: SignParams & {
    device: Device;
    appName?: string;
    selectDeviceLink?: boolean;
    onSuccess?: (payload: unknown) => void;
    onError?: (error: Error) => void;
    analyticsPropertyFlow?: string;
    forceSelectDevice?: boolean;
  };
  [ScreenName.XrpRemoveTokenValidationError]: SignParams & {
    deviceId: string;
    error: Error;
  };
  [ScreenName.XrpRemoveTokenValidationSuccess]: SignParams & {
    deviceId: string;
    result: Operation;
  };
};
