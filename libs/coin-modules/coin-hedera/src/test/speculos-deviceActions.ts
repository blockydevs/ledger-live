import type { DeviceAction, State } from "@ledgerhq/coin-framework/bot/types";
import {
  deviceActionFlow,
  formatDeviceAmount,
  SpeculosButton,
} from "@ledgerhq/coin-framework/bot/specs";
import type { Transaction } from "../types";

export const acceptTransferTransaction: DeviceAction<
  Transaction,
  State<Transaction>
> = deviceActionFlow({
  steps: [
    {
      title: "Summary",
      button: SpeculosButton.RIGHT,
    },
    {
      title: "Operator",
      button: SpeculosButton.RIGHT,
      expectedValue: ({ account }) => account.freshAddress,
    },
    {
      title: "From",
      button: SpeculosButton.RIGHT,
      expectedValue: ({ account }) => account.freshAddress,
    },
    {
      title: "To",
      button: SpeculosButton.RIGHT,
      expectedValue: ({ transaction }) => transaction.recipient,
    },
    {
      title: "Amount",
      button: SpeculosButton.RIGHT,
      expectedValue: ({ account, status: { amount } }) => {
        return formatDeviceAmount(account.currency, amount, {
          postfixCode: true,
          showAllDigits: true,
        }).toLowerCase();
      },
    },
    {
      title: "Max fees",
      button: SpeculosButton.RIGHT,
      // FIXME: should come from transaction.maxFee once swaps feature is merged
      expectedValue: () => "1 hbar",
    },
    {
      title: "Memo",
      button: SpeculosButton.RIGHT,
      expectedValue: ({ transaction }) => transaction.memo ?? "",
    },
    {
      title: "Confirm",
      button: SpeculosButton.BOTH,
    },
  ],
});
