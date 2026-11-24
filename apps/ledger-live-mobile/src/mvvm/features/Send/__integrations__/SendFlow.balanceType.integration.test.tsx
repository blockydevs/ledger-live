import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import BigNumber from "bignumber.js";
import { UserLock } from "@ledgerhq/lumen-ui-rnative/symbols";
import { genAccount } from "@ledgerhq/ledger-wallet-framework/mocks/account";
import { getCryptoCurrencyById } from "@domain/entity-currency-crypto";
import { sendFeatures } from "@ledgerhq/live-common/bridge/descriptor/send/features";
import type {
  BalanceTypeConfig,
  BalanceTypeOption,
} from "@ledgerhq/live-common/bridge/descriptor/types";
import {
  SEND_FLOW_SOURCE,
  SEND_FLOW_STEP,
  type SendFlowInitParams,
  type SendFlowStep,
} from "@ledgerhq/live-common/flows/send/types";
import type { StepRegistry } from "@ledgerhq/live-common/flows/wizard/types";
import type { CryptoOrTokenCurrency } from "@domain/entity-currency";
import type { Account } from "@ledgerhq/types-live";
import { act, renderWithReactQuery, screen, within } from "@tests/test-renderer";
import { i18n } from "~/context/Locale";
import type { State } from "~/reducers/types";
import { SendFlowOrchestrator } from "../SendFlowOrchestrator";
import { SEND_FLOW_CONFIG } from "../constants";
import { BalanceTypeScreen } from "../screens/BalanceType";
import { RecipientScreen } from "../screens/Recipient";
import { AmountScreen } from "../screens/Amount";
import { CustomFeesScreen } from "../screens/CustomFees";
import { CoinControlScreen } from "../screens/CoinControl";
import { ConfirmationScreen } from "../screens/Confirmation";
import { PaySuccessScreen } from "../screens/PaySuccess";
import type { SendBalanceTypeSync, SendBalanceTypeSyncProps } from "../utils/familySendSlots";

jest.mock("~/generated/SendBalanceTypeSync", () => ({ __esModule: true, default: {} }));

const familySyncSlots: Record<string, SendBalanceTypeSync> = jest.requireMock(
  "~/generated/SendBalanceTypeSync",
).default;

jest.mock("LLM/features/Contacts/hooks/useContactsAddressValidationAdapter", () => ({
  useContactsAddressValidationAdapter: () => {
    return {
      validateAddress: async ({ address }: { address: string }) => {
        return { status: "valid", resolvedAddress: address, isDomain: false };
      },
    };
  },
}));

const ethereum = getCryptoCurrencyById("ethereum");
const bitcoin = getCryptoCurrencyById("bitcoin");
const poolAccount = genAccount("balance-type-pool-account", { currency: ethereum });
const bitcoinAccount = genAccount("balance-type-bitcoin-account", { currency: bitcoin });
const RECIPIENT = genAccount("balance-type-recipient", { currency: ethereum }).freshAddress;

const PUBLIC_POOL_BALANCE = new BigNumber("1000000000000000000");

const PUBLIC_POOL: BalanceTypeOption = {
  id: "public",
  translationKey: "balanceType.mockPublic",
  balance: PUBLIC_POOL_BALANCE,
  hasPendingBalance: false,
  icon: "check",
};

const PRIVATE_POOL: BalanceTypeOption = {
  id: "private",
  translationKey: "balanceType.mockPrivate",
  balance: new BigNumber(0),
  hasPendingBalance: true,
  icon: "lock",
};

type PoolTransaction = { balancePool?: string };

const mockBalanceTypeConfig: BalanceTypeConfig = {
  getOptions: () => [PUBLIC_POOL, PRIVATE_POOL],
  getSelectedOptionId: transaction => (transaction as PoolTransaction).balancePool ?? "public",
  buildSelectionPatch: optionId => ({ balancePool: optionId }),
  getSelfTransferTarget: () => null,
  buildSelfTransferPatch: () => ({}),
  getSelectableBalance: ({ optionId }) => {
    return optionId === "public" ? PUBLIC_POOL_BALANCE : new BigNumber(0);
  },
};

const stepRegistry: StepRegistry<SendFlowStep> = {
  [SEND_FLOW_STEP.BALANCE_TYPE]: BalanceTypeScreen,
  [SEND_FLOW_STEP.RECIPIENT]: RecipientScreen,
  [SEND_FLOW_STEP.RECENT_HISTORY]: () => null,
  [SEND_FLOW_STEP.AMOUNT]: AmountScreen,
  [SEND_FLOW_STEP.CUSTOM_FEES]: CustomFeesScreen,
  [SEND_FLOW_STEP.COIN_CONTROL]: CoinControlScreen,
  [SEND_FLOW_STEP.SIGNATURE]: () => null,
  [SEND_FLOW_STEP.CONFIRMATION]: ConfirmationScreen,
  [SEND_FLOW_STEP.PAY_SUCCESS]: PaySuccessScreen,
};

const HostStack = createNativeStackNavigator();

function isPoolCurrency(currency: CryptoOrTokenCurrency | undefined) {
  return currency?.id === ethereum.id;
}

function TestBalanceTypeSync({
  account,
  transaction,
  onComplete,
  onClose,
}: SendBalanceTypeSyncProps) {
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

function SendPage({ initParams }: { initParams: SendFlowInitParams }) {
  return (
    <HostStack.Navigator screenOptions={{ headerShown: false }}>
      <HostStack.Screen name="SendHost">
        {() => (
          <SendFlowOrchestrator
            initParams={initParams}
            onClose={() => {}}
            stepRegistry={stepRegistry}
            flowConfig={SEND_FLOW_CONFIG}
          />
        )}
      </HostStack.Screen>
    </HostStack.Navigator>
  );
}

function renderSend(account: Account, initParams: Omit<SendFlowInitParams, "account"> = {}) {
  return renderWithReactQuery(<SendPage initParams={{ account, ...initParams }} />, {
    overrideInitialState: (state: State) => {
      return { ...state, accounts: { ...state.accounts, active: [account] } };
    },
  });
}

async function flushTimers(): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(600);
  });
}

describe("Send flow balance type step", () => {
  beforeAll(() => {
    i18n.addResourceBundle(
      "en",
      "common",
      {
        send: {
          newSendFlow: {
            balanceType: {
              mockPublic: { title: "Public pool", subtitle: "Visible on-chain" },
              mockPrivate: {
                title: "Private pool",
                subtitle: "Hidden on-chain",
                pendingNoticeTitle: "Funds maturing",
                pendingNotice: "Some funds are not spendable yet",
              },
            },
          },
        },
      },
      true,
      false,
    );
  });

  beforeEach(() => {
    jest.spyOn(sendFeatures, "hasBalanceTypeStep").mockImplementation(isPoolCurrency);
    const getBalanceTypeConfig = jest.spyOn(sendFeatures, "getBalanceTypeConfig");
    getBalanceTypeConfig.mockImplementation(currency => {
      return isPoolCurrency(currency) ? mockBalanceTypeConfig : null;
    });
  });

  afterEach(() => {
    jest.mocked(sendFeatures.hasBalanceTypeStep).mockRestore();
    jest.mocked(sendFeatures.getBalanceTypeConfig).mockRestore();
  });

  it("should open on the balance type step with only the select balance title", async () => {
    renderSend(poolAccount);

    expect(await screen.findByText("Select balance")).toBeVisible();
    expect(screen.getByText("Public pool")).toBeVisible();
    expect(screen.getByText("Private pool")).toBeVisible();
    expect(screen.queryByText(/Public pool\)|Private pool\)/)).not.toBeOnTheScreen();
    expect(screen.queryByPlaceholderText(/^Enter address/)).not.toBeOnTheScreen();
    expect(screen.queryByLabelText("Back")).not.toBeOnTheScreen();
  });

  it("should open on the balance type step when the recipient is pre-filled", async () => {
    renderSend(poolAccount, { recipient: RECIPIENT, skipRecipientStep: true });

    expect(await screen.findByText("Select balance")).toBeVisible();
    expect(screen.queryByText("Review")).not.toBeOnTheScreen();
  });

  it("should warn about an empty pool and a pool with pending funds", async () => {
    renderSend(poolAccount);

    expect(await screen.findByText("No available balance")).toBeVisible();
    expect(screen.getByText("Funds maturing")).toBeVisible();
    expect(screen.getByText("Some funds are not spendable yet")).toBeVisible();
  });

  it("should continue to the recipient step with the pool label and pool balance in the header", async () => {
    const { user } = renderSend(poolAccount);

    await user.press(await screen.findByText("Public pool"));

    expect(await screen.findByPlaceholderText(/^Enter address/)).toBeVisible();
    expect(screen.getByText(/\(Public pool\) · 1 ETH$/)).toBeVisible();
  });

  it("should keep a pre-filled recipient when the already selected pool is picked", async () => {
    const { user } = renderSend(poolAccount, {
      recipient: RECIPIENT,
      skipRecipientStep: true,
      source: SEND_FLOW_SOURCE.PAY,
    });

    await user.press(await screen.findByText("Public pool"));

    expect(await screen.findByDisplayValue(RECIPIENT)).toBeVisible();
  });

  it("should clear a pre-filled recipient and land on the recipient step when another pool is picked", async () => {
    const { user } = renderSend(poolAccount, {
      recipient: RECIPIENT,
      skipRecipientStep: true,
      source: SEND_FLOW_SOURCE.PAY,
    });

    await user.press(await screen.findByText("Private pool"));

    expect(await screen.findByPlaceholderText(/^Enter address/)).toBeVisible();
    expect(screen.queryByDisplayValue(RECIPIENT)).not.toBeOnTheScreen();
    expect(screen.getByText(/\(Private pool\)/)).toBeVisible();
  });

  it("should go back from the recipient step to the balance type step", async () => {
    const { user } = renderSend(poolAccount);

    await user.press(await screen.findByText("Public pool"));
    await user.press(await screen.findByLabelText("Back"));

    expect(await screen.findByText("Select balance")).toBeVisible();
    expect(screen.getByText("Private pool")).toBeVisible();
  });

  it("should keep the typed recipient when the same pool is picked again after going back", async () => {
    const { user } = renderSend(poolAccount);

    await user.press(await screen.findByText("Public pool"));
    await user.paste(await screen.findByPlaceholderText(/^Enter address/), RECIPIENT);
    await flushTimers();
    await user.press(await screen.findByTestId("new-send-flow-address-confirm"));
    await screen.findByText("Review");

    await user.press(screen.getByLabelText("Back"));
    await user.press(await screen.findByLabelText("Back"));
    await user.press(await screen.findByText("Public pool"));

    expect(await screen.findByDisplayValue(RECIPIENT)).toBeVisible();
  });

  it("should clear the typed recipient when another pool is picked after going back", async () => {
    const { user } = renderSend(poolAccount);

    await user.press(await screen.findByText("Public pool"));
    await user.paste(await screen.findByPlaceholderText(/^Enter address/), RECIPIENT);
    await flushTimers();
    await user.press(await screen.findByTestId("new-send-flow-address-confirm"));
    await screen.findByText("Review");

    await user.press(screen.getByLabelText("Back"));
    await user.press(await screen.findByLabelText("Back"));
    await user.press(await screen.findByText("Private pool"));

    expect(await screen.findByPlaceholderText(/^Enter address/)).toBeVisible();
    expect(screen.queryByDisplayValue(RECIPIENT)).not.toBeOnTheScreen();
  });

  it("should open on the recipient step without a back action for a coin without balance pools", async () => {
    renderSend(bitcoinAccount);

    expect(await screen.findByPlaceholderText(/^Enter address/)).toBeVisible();
    expect(screen.queryByText("Select balance")).not.toBeOnTheScreen();
    expect(screen.queryByLabelText("Back")).not.toBeOnTheScreen();
  });

  describe("with a family balance type sync", () => {
    const isSyncRequired = jest.fn(({ transaction }: { transaction: object }) => {
      return (transaction as PoolTransaction).balancePool === "private";
    });

    beforeEach(() => {
      isSyncRequired.mockClear();
      familySyncSlots.evm = { isRequired: isSyncRequired, Component: TestBalanceTypeSync };
    });

    afterEach(() => {
      delete familySyncSlots.evm;
    });

    it("should show the family sync with the account and the picked pool before the recipient step", async () => {
      const { user } = renderSend(poolAccount);

      await user.press(await screen.findByText("Private pool"));

      expect(
        await screen.findByText(`Syncing ${poolAccount.id} for the private pool`),
      ).toBeVisible();
      expect(screen.queryByPlaceholderText(/^Enter address/)).not.toBeOnTheScreen();
    });

    it("should continue to the recipient step and go back to the balance type step when the sync completes", async () => {
      const { user } = renderSend(poolAccount);

      await user.press(await screen.findByText("Private pool"));
      await user.press(await screen.findByText("Finish sync"));

      expect(await screen.findByPlaceholderText(/^Enter address/)).toBeVisible();

      await user.press(screen.getByLabelText("Back"));

      expect(await screen.findByText("Select balance")).toBeVisible();
      expect(screen.queryByText("Finish sync")).not.toBeOnTheScreen();
    });

    it("should stay on the balance type step when the sync closes", async () => {
      const { user } = renderSend(poolAccount);

      await user.press(await screen.findByText("Private pool"));
      await user.press(await screen.findByText("Cancel sync"));

      expect(screen.queryByText("Cancel sync")).not.toBeOnTheScreen();
      expect(screen.getByText("Select balance")).toBeVisible();
      expect(screen.queryByPlaceholderText(/^Enter address/)).not.toBeOnTheScreen();
    });

    it("should go straight to the recipient step when the family needs no sync for the pick", async () => {
      const { user } = renderSend(poolAccount);

      await user.press(await screen.findByText("Public pool"));

      expect(await screen.findByPlaceholderText(/^Enter address/)).toBeVisible();
      expect(isSyncRequired).toHaveBeenCalled();
      expect(screen.queryByText("Finish sync")).not.toBeOnTheScreen();
    });
  });

  describe("with a self-transfer target", () => {
    const buildSelfTransferPatch = jest.fn(({ isSelfTransfer }: { isSelfTransfer: boolean }) => ({
      selfTransfer: isSelfTransfer,
    }));

    beforeEach(() => {
      buildSelfTransferPatch.mockClear();
      jest.mocked(sendFeatures.getBalanceTypeConfig).mockImplementation(currency => {
        if (!isPoolCurrency(currency)) return null;
        return {
          ...mockBalanceTypeConfig,
          getSelfTransferTarget: () => ({
            address: poolAccount.freshAddress,
            translationKey: "recipient.selfTransfer.toPrivate",
            isDestinationPublic: false,
          }),
          buildSelfTransferPatch,
        };
      });
    });

    it("should send to the other pool from the self transfer row and show it on the amount step", async () => {
      const { user } = renderSend(poolAccount);

      await user.press(await screen.findByText("Public pool"));
      expect(await screen.findByText("Self transfer")).toBeVisible();
      expect(
        within(screen.getByTestId("self-transfer-section")).UNSAFE_getByType(UserLock),
      ).toBeTruthy();
      await user.press(screen.getByText("Send to private balance"));

      expect(await screen.findByText("Review")).toBeVisible();
      expect(screen.getByDisplayValue("Private balance")).toBeVisible();
      expect(buildSelfTransferPatch).toHaveBeenCalledWith(
        expect.objectContaining({ isSelfTransfer: true }),
      );
    });

    describe("when the target needs a memo", () => {
      beforeEach(() => {
        jest.spyOn(sendFeatures, "hasMemoForRecipient").mockImplementation(isPoolCurrency);
      });

      afterEach(() => {
        jest.mocked(sendFeatures.hasMemoForRecipient).mockRestore();
      });

      it("should ask to skip the memo from the self transfer row like a typed address", async () => {
        const { user } = renderSend(poolAccount);

        await user.press(await screen.findByText("Public pool"));
        await user.press(await screen.findByText("Send to private balance"));

        expect(await screen.findByText(/^Do you want to send without a/)).toBeVisible();
        expect(screen.queryByText("Review")).not.toBeOnTheScreen();
      });
    });

    it("should flag a typed own pool address as a self transfer", async () => {
      const { user } = renderSend(poolAccount);

      await user.press(await screen.findByText("Public pool"));
      await user.paste(
        await screen.findByPlaceholderText(/^Enter address/),
        poolAccount.freshAddress,
      );
      await flushTimers();
      await user.press(await screen.findByTestId("new-send-flow-address-confirm"));

      expect(await screen.findByText("Review")).toBeVisible();
      expect(screen.getByDisplayValue("Private balance")).toBeVisible();
      expect(buildSelfTransferPatch).toHaveBeenCalledWith(
        expect.objectContaining({ isSelfTransfer: true }),
      );
    });

    it("should keep the self transfer row next to a typed address that matches", async () => {
      const { user } = renderSend(poolAccount);

      await user.press(await screen.findByText("Public pool"));
      await user.paste(await screen.findByPlaceholderText(/^Enter address/), RECIPIENT);
      await flushTimers();

      expect(await screen.findByTestId("new-send-flow-address-confirm")).toBeVisible();
      expect(screen.getByTestId("self-transfer-button")).toBeVisible();
    });

    it("should send to the other pool from the self transfer row after an address was typed", async () => {
      const { user } = renderSend(poolAccount);

      await user.press(await screen.findByText("Public pool"));
      await user.paste(await screen.findByPlaceholderText(/^Enter address/), RECIPIENT);
      await flushTimers();
      await screen.findByTestId("new-send-flow-address-confirm");
      await user.press(screen.getByTestId("self-transfer-button"));

      expect(await screen.findByText("Review")).toBeVisible();
      expect(screen.getByDisplayValue("Private balance")).toBeVisible();
      expect(buildSelfTransferPatch).toHaveBeenCalledWith(
        expect.objectContaining({ isSelfTransfer: true }),
      );
    });

    it("should keep the self transfer row next to an invalid address error", async () => {
      const { user } = renderSend(poolAccount);

      await user.press(await screen.findByText("Public pool"));
      await user.paste(await screen.findByPlaceholderText(/^Enter address/), "not-an-address");
      await flushTimers();

      expect(screen.getByTestId("self-transfer-button")).toBeVisible();
      expect(screen.queryByTestId("new-send-flow-address-confirm")).not.toBeOnTheScreen();
    });

    it("should clear the self transfer when another address is chosen", async () => {
      const { user } = renderSend(poolAccount);

      await user.press(await screen.findByText("Public pool"));
      await user.press(await screen.findByText("Send to private balance"));
      await screen.findByText("Review");

      await user.press(screen.getByLabelText("Back"));
      const addressInput = await screen.findByDisplayValue(poolAccount.freshAddress);
      await user.clear(addressInput);
      await user.paste(addressInput, RECIPIENT);
      await flushTimers();
      const sendToRecipient = await screen.findByTestId("new-send-flow-address-confirm");
      buildSelfTransferPatch.mockClear();
      await user.press(sendToRecipient);

      expect(await screen.findByText("Review")).toBeVisible();
      expect(screen.queryByDisplayValue("Private balance")).not.toBeOnTheScreen();
      expect(buildSelfTransferPatch).toHaveBeenCalledWith(
        expect.objectContaining({ isSelfTransfer: false }),
      );
      expect(buildSelfTransferPatch).not.toHaveBeenCalledWith(
        expect.objectContaining({ isSelfTransfer: true }),
      );
    });

    it("should not offer a self transfer for a coin without balance pools", async () => {
      renderSend(bitcoinAccount);

      expect(await screen.findByPlaceholderText(/^Enter address/)).toBeVisible();
      expect(screen.queryByText("Self transfer")).not.toBeOnTheScreen();
    });
  });
});
