import React, { useEffect } from "react";
import { TouchableOpacity } from "react-native";
import BigNumber from "bignumber.js";
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from "@react-navigation/native-stack";
import { CommonActions, type NavigatorScreenParams } from "@react-navigation/native";
import { HEDERA_TRANSACTION_MODES } from "@ledgerhq/live-common/families/hedera/constants";
import type { Transaction, TransactionStatus } from "@ledgerhq/live-common/families/hedera/types";
import type { Operation, SignedOperation } from "@ledgerhq/types-live";
import { HEDERA_ACCOUNT_1 } from "./account.mock";
import { htsToken } from "./currency.mock";

// Shared scaffolding for the AssociateTokenFlow / DelegationFlow mobile integration tests.
// Lives in __mocks__ so it can be `require()`d from inside a hoisted jest.mock() factory.

type MockSelectDeviceProps = {
  navigation: {
    navigate: (name: string, params: Record<string, unknown>) => void;
  };
  route: { name: string; params: Record<string, unknown> };
};

function MockSelectDevice({ navigation, route }: MockSelectDeviceProps) {
  return (
    <TouchableOpacity
      testID="mock-select-device"
      onPress={() =>
        navigation.navigate(route.name.replace("SelectDevice", "ConnectDevice"), {
          ...route.params,
          device: { deviceId: "device-1", modelId: "stax", wired: false },
        })
      }
    />
  );
}

// Stub the device-list screen (BLE/USB scanning) while keeping its SelectDevice -> ConnectDevice
// forward-navigation contract.
export const selectDeviceModuleMock = {
  __esModule: true,
  default: MockSelectDevice,
};

type DeviceActionProps = {
  renderOnResult?: (p: unknown) => React.ReactNode;
  request?: unknown;
};

export const deviceActionRequestSpy = jest.fn();

// Switched at runtime so one mock can cover both happy-path and error-path outcomes.
const deviceActionResult: { current: unknown } = {
  current: null,
};

export function setDeviceActionSigned(operation: Operation) {
  deviceActionResult.current = {
    signedOperation: { signature: "sig", operation },
  };
}

export function setDeviceActionSignError(message: string) {
  deviceActionResult.current = { transactionSignError: new Error(message) };
}

export const deviceActionModuleMock = {
  __esModule: true,
  default: ({ renderOnResult, request }: DeviceActionProps) => {
    deviceActionRequestSpy(request);
    return renderOnResult ? renderOnResult(deviceActionResult.current) : null;
  },
};

// gRPC broadcast can't be intercepted by MSW; stub it so no real mainnet write fires.
export const broadcastModuleMock = {
  useBroadcast: () => (signed: SignedOperation) => Promise.resolve(signed.operation),
};

function createZeroBridgeStatus(): TransactionStatus {
  return {
    errors: {},
    warnings: {},
    estimatedFees: new BigNumber(0),
    amount: new BigNumber(0),
    totalSpent: new BigNumber(0),
  };
}

const mockAssociateTransaction: Transaction = {
  family: "hedera",
  mode: HEDERA_TRANSACTION_MODES.TokenAssociate,
  amount: new BigNumber(0),
  recipient: "",
  useAllAmount: false,
  assetReference: htsToken.contractAddress,
  assetOwner: HEDERA_ACCOUNT_1.freshAddress,
  properties: { token: htsToken },
};

// AssociateTokenFlow: hedera has no mock bridge, so stub the hook with a fixed error-free
// transaction/status. Stateless, the transaction never changes across the flow.
export const associateBridgeTransactionModuleMock = {
  __esModule: true,
  default: () => ({
    transaction: mockAssociateTransaction,
    status: createZeroBridgeStatus(),
    bridgeError: null,
    bridgePending: false,
    updateTransaction: jest.fn(),
    setAccount: jest.fn(),
  }),
};

// DelegationFlow: backed by real React state, since its tests rely on the
// SelectValidator -> Summary -> `updateTransaction` round-trip.
export function createStatefulBridgeTransactionMock(
  initialTransaction: Partial<Transaction> & Pick<Transaction, "family" | "mode">,
) {
  const initial: Transaction = {
    amount: new BigNumber(0),
    recipient: "",
    useAllAmount: false,
    ...initialTransaction,
  } as Transaction;

  function useBridgeTransaction() {
    const [transaction, setTransaction] = React.useState(initial);
    // Stable identity so Summary's effect doesn't loop.
    const updateTransaction = React.useCallback(
      (updater: (t: Transaction) => Transaction) =>
        setTransaction((prev: Transaction) => updater(prev)),
      [],
    );
    return {
      transaction,
      status: createZeroBridgeStatus(),
      bridgeError: null,
      bridgePending: false,
      updateTransaction,
      setAccount: jest.fn(),
    };
  }

  return {
    __esModule: true,
    default: useBridgeTransaction,
  };
}

export function createFakeOperation(overrides: Pick<Operation, "id" | "hash" | "type">): Operation {
  return {
    value: new BigNumber(0),
    fee: new BigNumber(0),
    senders: [HEDERA_ACCOUNT_1.freshAddress],
    recipients: [],
    blockHeight: null,
    blockHash: null,
    accountId: HEDERA_ACCOUNT_1.id,
    date: new Date(),
    extra: {},
    hasFailed: false,
    ...overrides,
  };
}

export function createHederaFlowTestNavigator(options: {
  navigatorName: string;
  flowComponent: React.ComponentType<never>;
  entryScreen: string;
  entryParams: object;
}) {
  type RootStackParamList = {
    Entry: undefined;
  } & Record<string, NavigatorScreenParams<Record<string, object | undefined>> | undefined>;

  const RootStack = createNativeStackNavigator<RootStackParamList>();

  function EntryScreen({
    navigation,
  }: {
    navigation: NativeStackNavigationProp<RootStackParamList>;
  }) {
    useEffect(() => {
      // CommonActions.navigate takes a plain string, so it can target a dynamic route name that
      // navigate()'s typed overloads can't resolve.
      navigation.dispatch(
        CommonActions.navigate(options.navigatorName, {
          screen: options.entryScreen,
          params: options.entryParams,
        }),
      );
    }, [navigation]);
    return null;
  }

  return function TestNavigator() {
    return (
      <RootStack.Navigator initialRouteName="Entry" screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="Entry" component={EntryScreen} />
        <RootStack.Screen
          name={options.navigatorName}
          component={options.flowComponent as React.ComponentType<object>}
        />
      </RootStack.Navigator>
    );
  };
}
