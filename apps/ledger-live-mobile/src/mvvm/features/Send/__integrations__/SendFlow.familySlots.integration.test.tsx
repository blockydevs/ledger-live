import React, { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import BigNumber from "bignumber.js";
import { genAccount } from "@ledgerhq/ledger-wallet-framework/mocks/account";
import { getCryptoCurrencyById } from "@domain/entity-currency-crypto";
import { sendFeatures } from "@ledgerhq/live-common/bridge/descriptor/send/features";
import type { BalanceTypeConfig } from "@ledgerhq/live-common/bridge/descriptor/types";
import { SEND_FLOW_STEP, type SendFlowStep } from "@ledgerhq/live-common/flows/send/types";
import type { StepRegistry } from "@ledgerhq/live-common/flows/wizard/types";
import type { CryptoOrTokenCurrency } from "@domain/entity-currency";
import { act, renderWithReactQuery, screen } from "@tests/test-renderer";
import { i18n } from "~/context/Locale";
import type { State } from "~/reducers/types";
import type {
  AmountFooterRowProps,
  BalanceTypeSyncProps,
  CustomSendFlow,
} from "~/screens/SendFunds/utils/customSendFlow";
import { SendFlowOrchestrator } from "../SendFlowOrchestrator";
import { SEND_FLOW_CONFIG } from "../constants";
import { BalanceTypeScreen } from "../screens/BalanceType";
import { BalanceTypeSyncScreen } from "../screens/BalanceTypeSync";
import { RecipientScreen } from "../screens/Recipient";
import { AmountScreen } from "../screens/Amount";

type PoolTransaction = { balancePool?: string };

let mockTestFamilySendFlow: CustomSendFlow | null = null;

jest.mock("~/screens/SendFunds/utils/customSendFlow", () => {
  const actual = jest.requireActual<typeof import("~/screens/SendFunds/utils/customSendFlow")>(
    "~/screens/SendFunds/utils/customSendFlow",
  );

  return {
    ...actual,
    getCustomSendFlow: (family: string) => {
      return family === "evm" ? mockTestFamilySendFlow : actual.getCustomSendFlow(family);
    },
  };
});

jest.mock("LLM/features/Contacts/hooks/useContactsAddressValidationAdapter", () => {
  return {
    useContactsAddressValidationAdapter: () => {
      return {
        validateAddress: async ({ address }: { address: string }) => {
          return { status: "valid", resolvedAddress: address, isDomain: false };
        },
      };
    },
  };
});

const ethereum = getCryptoCurrencyById("ethereum");
const testFamilyAccount = genAccount("family-slots-account", { currency: ethereum });
const RECIPIENT = genAccount("family-slots-recipient", { currency: ethereum }).freshAddress;
const POOL_BALANCE = new BigNumber("1000000000000000000");

const mockBalanceTypeConfig: BalanceTypeConfig = {
  getSelectedOptionId: transaction => (transaction as PoolTransaction).balancePool ?? "public",
  buildSelectionPatch: optionId => ({ balancePool: optionId }),
  getSelfTransferTarget: () => null,
  buildSelfTransferPatch: () => ({}),
  getSelectableBalance: () => POOL_BALANCE,
  getOptions: () => [
    {
      id: "public",
      translationKey: "balanceType.mockPublic",
      balance: POOL_BALANCE,
      hasPendingBalance: false,
      icon: "check",
    },
    {
      id: "private",
      translationKey: "balanceType.mockPrivate",
      balance: POOL_BALANCE,
      hasPendingBalance: false,
      icon: "lock",
    },
  ],
};

const stepRegistry: StepRegistry<SendFlowStep> = {
  [SEND_FLOW_STEP.BALANCE_TYPE]: BalanceTypeScreen,
  [SEND_FLOW_STEP.BALANCE_TYPE_SYNC]: BalanceTypeSyncScreen,
  [SEND_FLOW_STEP.RECIPIENT]: RecipientScreen,
  [SEND_FLOW_STEP.RECENT_HISTORY]: () => null,
  [SEND_FLOW_STEP.AMOUNT]: AmountScreen,
  [SEND_FLOW_STEP.CUSTOM_FEES]: () => null,
  [SEND_FLOW_STEP.COIN_CONTROL]: () => null,
  [SEND_FLOW_STEP.SIGNATURE]: () => null,
  [SEND_FLOW_STEP.CONFIRMATION]: () => null,
  [SEND_FLOW_STEP.PAY_SUCCESS]: () => null,
};

const HostStack = createNativeStackNavigator();

function TestBalanceTypeSync({ account, transaction, onComplete, onClose }: BalanceTypeSyncProps) {
  const pool = (transaction as PoolTransaction).balancePool;

  return (
    <View>
      <Text>{`Syncing ${account.id} for the ${pool} pool`}</Text>
      <Pressable onPress={onComplete}>
        <Text>Finish sync</Text>
      </Pressable>
      <Pressable onPress={onClose}>
        <Text>Cancel sync</Text>
      </Pressable>
    </View>
  );
}

function TestInstantBalanceTypeSync({ onComplete }: BalanceTypeSyncProps) {
  useEffect(() => {
    onComplete();
  }, [onComplete]);

  return null;
}

function TestAmountFooterRow({ account, transaction }: AmountFooterRowProps) {
  return <Text testID="family-footer-row">{`${account.id} ${transaction.amount.toFixed()}`}</Text>;
}

function renderSend(onClose: () => void = () => {}) {
  return renderWithReactQuery(
    <HostStack.Navigator screenOptions={{ headerShown: false }}>
      <HostStack.Screen name="SendHost">
        {() => (
          <SendFlowOrchestrator
            initParams={{ account: testFamilyAccount }}
            onClose={onClose}
            stepRegistry={stepRegistry}
            flowConfig={SEND_FLOW_CONFIG}
          />
        )}
      </HostStack.Screen>
    </HostStack.Navigator>,
    {
      overrideInitialState: (state: State) => {
        return { ...state, accounts: { ...state.accounts, active: [testFamilyAccount] } };
      },
    },
  );
}

async function flushTimers(): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(600);
  });
}

async function goToAmount(user: ReturnType<typeof renderSend>["user"]) {
  const recipientInput = await screen.findByPlaceholderText(/^Enter address/);
  await user.paste(recipientInput, RECIPIENT);
  const sendToButton = await screen.findByText(/^Send to /);
  await user.press(sendToButton);
  await screen.findByText("Review");
}

async function pickPool(user: ReturnType<typeof renderSend>["user"], title: string) {
  const poolOption = await screen.findByText(title);
  await user.press(poolOption);
}

function isTestFamilyCurrency(currency: CryptoOrTokenCurrency | undefined) {
  return currency?.id === ethereum.id;
}

describe("Send flow family slots", () => {
  beforeAll(() => {
    i18n.addResourceBundle(
      "en",
      "common",
      {
        send: {
          newSendFlow: {
            balanceType: {
              mockPublic: { title: "Public pool", subtitle: "Visible on-chain" },
              mockPrivate: { title: "Private pool", subtitle: "Hidden on-chain" },
            },
          },
        },
      },
      true,
      false,
    );
  });

  afterEach(() => {
    mockTestFamilySendFlow = null;
  });

  describe("balance type sync", () => {
    beforeEach(() => {
      jest.spyOn(sendFeatures, "hasBalanceTypeStep").mockImplementation(isTestFamilyCurrency);
      jest.spyOn(sendFeatures, "getBalanceTypeConfig").mockImplementation(currency => {
        return isTestFamilyCurrency(currency) ? mockBalanceTypeConfig : null;
      });
    });

    afterEach(() => {
      jest.mocked(sendFeatures.hasBalanceTypeStep).mockRestore();
      jest.mocked(sendFeatures.getBalanceTypeConfig).mockRestore();
    });

    it("should show the family sync with the account and the picked pool before the recipient step", async () => {
      mockTestFamilySendFlow = { screens: [], BalanceTypeSync: TestBalanceTypeSync };
      const { user } = renderSend();

      await pickPool(user, "Private pool");

      const syncText = await screen.findByText(
        `Syncing ${testFamilyAccount.id} for the private pool`,
      );
      expect(syncText).toBeVisible();
      expect(screen.queryByPlaceholderText(/^Enter address/)).not.toBeOnTheScreen();
    });

    it("should continue to the recipient step and go back to the balance type step when the sync completes", async () => {
      mockTestFamilySendFlow = { screens: [], BalanceTypeSync: TestBalanceTypeSync };
      const { user } = renderSend();

      await pickPool(user, "Private pool");
      const finishButton = await screen.findByText("Finish sync");
      await user.press(finishButton);

      const recipientInput = await screen.findByPlaceholderText(/^Enter address/);
      expect(recipientInput).toBeVisible();

      await user.press(screen.getByLabelText("Back"));

      const balanceTypeTitle = await screen.findByText("Select balance");
      expect(balanceTypeTitle).toBeVisible();
      expect(screen.queryByText("Finish sync")).not.toBeOnTheScreen();
    });

    it("should close the flow when the sync closes", async () => {
      mockTestFamilySendFlow = { screens: [], BalanceTypeSync: TestBalanceTypeSync };
      const onClose = jest.fn();
      const { user } = renderSend(onClose);

      await pickPool(user, "Public pool");
      const cancelButton = await screen.findByText("Cancel sync");
      await user.press(cancelButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("should go straight on to the recipient step when the family has nothing to sync", async () => {
      mockTestFamilySendFlow = { screens: [], BalanceTypeSync: TestInstantBalanceTypeSync };
      const { user } = renderSend();

      await pickPool(user, "Public pool");

      const recipientInput = await screen.findByPlaceholderText(/^Enter address/);
      expect(recipientInput).toBeVisible();
    });

    it("should open the recipient step right after the pick for a family without a sync", async () => {
      const { user } = renderSend();

      await pickPool(user, "Public pool");

      const recipientInput = await screen.findByPlaceholderText(/^Enter address/);
      expect(recipientInput).toBeVisible();
    });
  });

  describe("amount footer row", () => {
    it("should render the family row under the network fees and follow the amount", async () => {
      mockTestFamilySendFlow = { screens: [], AmountFooterRow: TestAmountFooterRow };
      const { user } = renderSend();
      await goToAmount(user);

      const nodesWithTestId = screen.root.findAll(node => typeof node.props.testID === "string");
      const testIdsInOrder = nodesWithTestId.map(node => node.props.testID as string);
      expect(testIdsInOrder.indexOf("send-network-fees-value")).toBeGreaterThan(-1);
      expect(testIdsInOrder.indexOf("family-footer-row")).toBeGreaterThan(
        testIdsInOrder.indexOf("send-network-fees-value"),
      );

      await user.press(screen.getByTestId("send-quick-actions-half"));
      await flushTimers();

      const halfBalance = testFamilyAccount.spendableBalance.dividedBy(2).integerValue();
      expect(screen.getByTestId("family-footer-row")).toHaveTextContent(
        `${testFamilyAccount.id} ${halfBalance.toFixed()}`,
      );
    });

    it("should add no row for a family without one", async () => {
      const { user } = renderSend();
      await goToAmount(user);

      expect(screen.getByTestId("send-network-fees-value")).toBeVisible();
      expect(screen.queryByTestId("family-footer-row")).not.toBeOnTheScreen();
    });
  });
});
