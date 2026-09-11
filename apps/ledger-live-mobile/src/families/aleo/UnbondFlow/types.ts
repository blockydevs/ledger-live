import type { Operation } from "@ledgerhq/types-live";
import type { Transaction, TransactionStatus } from "@ledgerhq/live-common/families/aleo/types";
import type { Device } from "@ledgerhq/live-common/hw/actions/types";
import type { ParamListBase, RouteProp } from "@react-navigation/native";
import { ScreenName } from "~/const";

export type UnbondFlowParamList = {
  [ScreenName.AleoUnbondAmount]: {
    accountId: string;
    parentId?: string;
  };
  [ScreenName.AleoUnbondSelectDevice]: {
    accountId: string;
    parentId?: string;
    transaction?: Transaction;
    status?: TransactionStatus;
    source?: RouteProp<ParamListBase, ScreenName>;
  };
  [ScreenName.AleoUnbondConnectDevice]: {
    device?: Device;
    accountId: string;
    parentId?: string;
    transaction: Transaction;
    status: TransactionStatus;
    appName?: string;
    selectDeviceLink?: boolean;
    onSuccess?: (payload: unknown) => void;
    onError?: (error: Error) => void;
    analyticsPropertyFlow?: string;
    forceSelectDevice?: boolean;
  };
  [ScreenName.AleoUnbondValidationSuccess]: {
    accountId: string;
    parentId?: string;
    result: Operation;
  };
  [ScreenName.AleoUnbondValidationError]: {
    accountId: string;
    parentId?: string;
    error: Error;
  };
};
