import type { Operation } from "@ledgerhq/types-live";
import type { Transaction } from "@ledgerhq/live-common/generated/types";
import type { Device } from "@ledgerhq/live-common/hw/actions/types";
import type {
  MultiversXAccount,
  TransactionStatus,
} from "@ledgerhq/live-common/families/multiversx/types";
import type { ScreenName } from "~/const";
import { ParamListBase, RouteProp } from "@react-navigation/native";

export type MultiversXDelegationFlowParamList = {
  [ScreenName.MultiversXDelegationStarted]: {
    account: MultiversXAccount;
    source?: RouteProp<ParamListBase, ScreenName>;
  };
  [ScreenName.MultiversXDelegationValidator]: {
    account: MultiversXAccount;
    transaction?: Transaction;
    source?: RouteProp<ParamListBase, ScreenName>;
    skipStartedStep?: boolean;
  };
  [ScreenName.MultiversXDelegationValidatorList]: {
    transaction: Transaction | null | undefined;
    account: MultiversXAccount;
    source?: RouteProp<ParamListBase, ScreenName>;
  };
  [ScreenName.MultiversXDelegationAmount]: {
    transaction: Transaction;
    account: MultiversXAccount;
    validatorName: string;
    source?: RouteProp<ParamListBase, ScreenName>;
  };
  [ScreenName.MultiversXDelegationSelectDevice]: {
    accountId: string;
    parentId?: string;
    transaction?: Transaction | null | undefined;
    status?: TransactionStatus;
    source?: RouteProp<ParamListBase, ScreenName>;
  };
  [ScreenName.MultiversXDelegationConnectDevice]: {
    device: Device;
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
    source?: RouteProp<ParamListBase, ScreenName>;
  };
  [ScreenName.MultiversXDelegationValidationError]: {
    accountId: string;
    deviceId: string;
    transaction: Transaction;
    error: Error;
    source?: RouteProp<ParamListBase, ScreenName>;
  };
  [ScreenName.MultiversXDelegationValidationSuccess]: {
    accountId: string;
    deviceId: string;
    transaction: Transaction;
    result: Operation;
    source?: RouteProp<ParamListBase, ScreenName>;
  };
};
