import { CurrenciesData, DatasetTest } from "@ledgerhq/types-live";
import { Transaction } from "../types";

// TODO:
const aleo: CurrenciesData<Transaction> = {
  FIXME_ignorePreloadFields: ["validators"],
  scanAccounts: [],
  accounts: [],
};

export const dataset: DatasetTest<Transaction> = {
  implementations: ["js"],
  currencies: {
    aleo,
  },
};
