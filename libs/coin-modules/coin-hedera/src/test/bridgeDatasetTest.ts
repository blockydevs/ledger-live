// import "../../__tests__/test-helpers/setup";
import {
  NotEnoughBalance,
  InvalidAddressBecauseDestinationIsAlsoSource,
  AmountRequired,
} from "@ledgerhq/ledger-wallet-framework/errors";
import type { CurrenciesData, DatasetTest } from "@ledgerhq/types-live";
import { HEDERA_TRANSACTION_MODES } from "../constants";
import { fromTransactionRaw } from "../transaction";
import type { Transaction } from "../types";

export const hedera: CurrenciesData<Transaction> = {
  FIXME_ignoreAccountFields: [
    "syncHash",
    // pending rewards change on a daily basis
    "hederaResources.delegation.pendingReward",
    // balance of ERC20 token account may change without any operation (e.g. Bonzo aUSDC)
    "balance",
    "spendableBalance",
  ],
  scanAccounts: [
    {
      name: "hedera seed 1",
      apdus: `
          => e002010009000000002c00000bd6
          <= bf4315b0bad6a735dce83024283704211001925c00fca881610e0d9f13d9f17c9000
          `,
    },
  ],
  accounts: [
    {
      FIXME_tests: ["balance is sum of ops"],
      raw: {
        id: `js:2:hedera:0.0.10901621:`,
        seedIdentifier: "",
        name: "Hedera 1",
        derivationMode: "hederaBip44",
        index: 0,
        freshAddress: "0.0.10901621",
        freshAddressPath: "44/3030/0/0/0",
        blockHeight: 0,
        operations: [],
        pendingOperations: [],
        currencyId: "hedera",
        lastSyncDate: "",
        balance: "0",
      },
      transactions: [
        {
          name: "Recipient and sender must not be the same",
          transaction: fromTransactionRaw({
            mode: HEDERA_TRANSACTION_MODES.Send,
            family: "hedera",
            recipient: "0.0.10901621",
            amount: "100000000",
          }),
          expectedStatus: {
            errors: {
              recipient: new InvalidAddressBecauseDestinationIsAlsoSource(),
            },
            warnings: {},
          },
        },
        {
          name: "Amount Required",
          transaction: fromTransactionRaw({
            mode: HEDERA_TRANSACTION_MODES.Send,
            family: "hedera",
            recipient: "0.0.10901621",
            amount: "0",
          }),
          expectedStatus: {
            errors: {
              amount: new AmountRequired(),
            },
            warnings: {},
          },
        },
        {
          name: "Not enough balance",
          transaction: fromTransactionRaw({
            mode: HEDERA_TRANSACTION_MODES.Send,
            family: "hedera",
            recipient: "0.0.10901621",
            amount: "1000000000000000",
          }),
          expectedStatus: {
            errors: {
              amount: new NotEnoughBalance(),
            },
            warnings: {},
          },
        },
        {
          name: "Send max",
          transaction: fromTransactionRaw({
            mode: HEDERA_TRANSACTION_MODES.Send,
            family: "hedera",
            recipient: "0.0.10901621",
            amount: "1000000000000000",
            useAllAmount: true,
          }),
          expectedStatus: (account, _, status) => {
            return {
              amount: account.balance.minus(status.estimatedFees),
              errors: {},
              warnings: {},
            };
          },
        },
      ],
    },
  ],
};

export const dataset: DatasetTest<Transaction> = {
  implementations: ["js"],
  currencies: {
    hedera,
  },
};
