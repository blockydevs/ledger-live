import { BigNumber } from "bignumber.js";
import {
  NotEnoughBalance,
  RecipientRequired,
  InvalidAddress,
  InvalidAddressBecauseDestinationIsAlsoSource,
  AmountRequired,
} from "@ledgerhq/errors";
import type { Account, AccountBridge, AccountLike, CurrencyBridge } from "@ledgerhq/types-live";
import type { GenericTransaction } from "../../../bridge/generic-coin-framework/types";
import { getMainAccount } from "../../../account";
import {
  scanAccounts,
  signOperation,
  signRawOperation,
  broadcast,
  sync,
  isInvalidRecipient,
  makeAccountBridgeReceive,
} from "../../../bridge/mockHelpers";
import {
  getSerializedAddressParameters,
  updateTransaction,
} from "@ledgerhq/ledger-wallet-framework/bridge/jsHelpers";
import { validateAddress } from "../../../bridge/validateAddress";

const MOCK_FEE = new BigNumber(50);

const receive = makeAccountBridgeReceive();

const estimateMaxSpendable = ({
  account,
  parentAccount,
}: {
  account: AccountLike;
  parentAccount?: Account | null | undefined;
}) => {
  const mainAccount = getMainAccount(account, parentAccount);
  return Promise.resolve(BigNumber.max(0, mainAccount.balance.minus(MOCK_FEE)));
};

const createTransaction = (): GenericTransaction => ({
  family: "hedera",
  mode: "send",
  amount: new BigNumber(0),
  fees: null,
  recipient: "",
  useAllAmount: false,
});

const getTransactionStatus = (a: Account, t: GenericTransaction) => {
  const errors: { recipient?: Error; amount?: Error } = {};
  const warnings: Record<string, Error> = {};

  if (a.freshAddress === t.recipient) {
    errors.recipient = new InvalidAddressBecauseDestinationIsAlsoSource();
  } else if (!t.recipient) {
    errors.recipient = new RecipientRequired("");
  } else if (isInvalidRecipient(t.recipient)) {
    errors.recipient = new InvalidAddress("");
  }

  const useAllAmount = !!t.useAllAmount;
  const amount = useAllAmount
    ? BigNumber.max(0, a.balance.minus(MOCK_FEE))
    : new BigNumber(t.amount);
  const totalSpent = amount.plus(MOCK_FEE);

  if (!errors.amount && amount.eq(0) && !useAllAmount) {
    errors.amount = new AmountRequired();
  }

  if (!errors.recipient && !errors.amount && totalSpent.gt(a.balance)) {
    errors.amount = new NotEnoughBalance();
  }

  return Promise.resolve({
    errors,
    warnings,
    estimatedFees: MOCK_FEE,
    amount,
    totalSpent,
  });
};

const prepareTransaction = async (_a: Account, t: GenericTransaction) => {
  if (t.fees) return t;
  return { ...t, fees: MOCK_FEE };
};

const accountBridge: AccountBridge<GenericTransaction> = {
  createTransaction,
  updateTransaction,
  getTransactionStatus,
  estimateMaxSpendable,
  prepareTransaction,
  sync,
  receive,
  signOperation,
  signRawOperation,
  broadcast,
  getSerializedAddressParameters,
  validateAddress,
};

const currencyBridge: CurrencyBridge = {
  preload: () => Promise.resolve({}),
  hydrate: () => {},
  scanAccounts,
};

export default {
  currencyBridge,
  accountBridge,
};
