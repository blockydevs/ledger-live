import React, { useEffect } from "react";
import { TouchableOpacity } from "react-native";
import BigNumber from "bignumber.js";
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from "@react-navigation/native-stack";
import type { NavigatorScreenParams } from "@react-navigation/native";
import { HEDERA_TRANSACTION_MODES } from "@ledgerhq/live-common/families/hedera/constants";
import type {
  Transaction,
  TransactionStatus,
} from "@ledgerhq/live-common/families/hedera/types";
import type { Operation } from "@ledgerhq/types-live";
import { HEDERA_ACCOUNT_1 } from "./account.mock";
import { htsToken } from "./currency.mock";

// Shared scaffolding for the AssociateTokenFlow / DelegationFlow mobile integration tests.
// Lives in __mocks__ (not __integrations__) so it can be `require()`d from inside a hoisted
// jest.mock() factory, which cannot close over out-of-scope variables:
// `jest.mock(path, () => require(".../hederaFlowTestSetup").someExport)`.

// -- SelectDevice --

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
        navigation.navigate(
          route.name.replace("SelectDevice", "ConnectDevice"),
          {
            ...route.params,
            device: { deviceId: "device-1", modelId: "stax", wired: false },
          }
        )
      }
    />
  );
}

// Stub only the device-list screen (BLE/USB scanning, zero hedera logic). Mirrors the real
// screen's own forward-navigation contract: SelectDevice -> ConnectDevice by name substitution.
export const selectDeviceModuleMock = {
  __esModule: true,
  default: MockSelectDevice,
};

// -- DeviceAction --

type DeviceActionProps = {
  renderOnResult?: (p: unknown) => React.ReactNode;
  request?: unknown;
};

// Records every `request` prop DeviceAction is rendered with, so tests can assert the actual
// transaction handed to the signer (mode, validator, token) — the flow's real output — instead
// of only the synthetic signed operation. Assert on the LAST call: the screen re-renders.
export const deviceActionRequestSpy = jest.fn();

function makeDeviceActionModuleMock(payload: unknown) {
  return {
    __esModule: true,
    default: ({ renderOnResult, request }: DeviceActionProps) => {
      deviceActionRequestSpy(request);
      return renderOnResult ? renderOnResult(payload) : null;
    },
  };
}

// Mirrors src/screens/ConnectDevice.test.tsx's DeviceAction mock: fires the result payload as
// soon as it mounts, simulating a device that signs the transaction immediately.
export const deviceActionSignedModuleMock = makeDeviceActionModuleMock({
  signedOperation: { signature: "sig", operation: {} },
});

// Mirrors src/screens/ConnectDevice.test.tsx's DeviceAction mock, but fires a
// `transactionSignError` payload instead of a signed operation to simulate the user
// refusing / the device failing to sign.
export function createDeviceActionSignErrorModuleMock(message: string) {
  return makeDeviceActionModuleMock({
    transactionSignError: new Error(message),
  });
}

// -- useBroadcast --

export const mockBroadcast = jest.fn();

// SECURITY: useSignedTxHandler (real, it's the subject under test) holds a useBroadcast
// internally. Mobile has no network blocking in its jest setup, so leaving this unmocked
// would fire a real signed-transaction write at Hedera mainnet from CI.
export const useBroadcastModuleMock = {
  useBroadcast: () => mockBroadcast,
};

// -- useBridgeTransaction (stateless variant) --
//
// AssociateTokenFlow only. DelegationFlow needs a STATEFUL mock (Summary.tsx's effect depends
// on `updateTransaction`'s identity; an unstable one causes an infinite render loop), so that
// one stays local to its own test file instead of being collapsed in here.

const mockAssociateTransaction: Transaction = {
  family: "hedera",
  mode: HEDERA_TRANSACTION_MODES.TokenAssociate,
  amount: new BigNumber(0),
  recipient: "",
  useAllAmount: false,
  assetReference: htsToken.contractAddress,
  assetOwner: HEDERA_ACCOUNT_1.freshAddress,
  properties: { token: htsToken },
} as unknown as Transaction;

const mockAssociateStatus: TransactionStatus = {
  errors: {},
  warnings: {},
  estimatedFees: new BigNumber(0),
  amount: new BigNumber(0),
  totalSpent: new BigNumber(0),
} as unknown as TransactionStatus;

// hedera has no registered mock bridge, so setEnv("MOCK","1") doesn't work here. Stub the
// hook directly with a resolved, error-free transaction/status (02-Summary.tsx disables
// Continue on bridgePending/bridgeError/status errors).
export const associateBridgeTransactionModuleMock = {
  __esModule: true,
  default: () => ({
    transaction: mockAssociateTransaction,
    status: mockAssociateStatus,
    bridgeError: null,
    bridgePending: false,
    updateTransaction: jest.fn(),
    setAccount: jest.fn(),
  }),
};

// -- fakeOperation --

export function createFakeOperation(
  overrides: Pick<Operation, "id" | "hash" | "type">
): Operation {
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

// -- TestNavigator (Entry -> flow navigator, by name substitution) --

export function createHederaFlowTestNavigator<
  NavigatorKey extends string,
  ParamList extends Record<string, object | undefined>
>(options: {
  navigatorName: NavigatorKey;
  flowComponent: React.ComponentType<never>;
  entryScreen: keyof ParamList;
  entryParams: ParamList[keyof ParamList];
}) {
  type RootStackParamList = {
    Entry: undefined;
  } & Record<NavigatorKey, NavigatorScreenParams<ParamList>>;

  const RootStack = createNativeStackNavigator<RootStackParamList>();

  function EntryScreen({
    navigation,
  }: {
    navigation: NativeStackNavigationProp<RootStackParamList>;
  }) {
    useEffect(() => {
      navigation.navigate(options.navigatorName, {
        screen: options.entryScreen,
        params: options.entryParams,
      } as never);
    }, [navigation]);
    return null;
  }

  return function TestNavigator() {
    return (
      <RootStack.Navigator
        initialRouteName="Entry"
        screenOptions={{ headerShown: false }}
      >
        <RootStack.Screen name="Entry" component={EntryScreen} />
        <RootStack.Screen
          name={options.navigatorName}
          component={options.flowComponent as React.ComponentType<object>}
        />
      </RootStack.Navigator>
    );
  };
}
