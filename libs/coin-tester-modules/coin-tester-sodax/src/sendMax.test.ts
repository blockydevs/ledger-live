import type { Transaction } from "@ledgerhq/coin-icon/types/index";
import type { SignOperationEvent } from "@ledgerhq/types-live";
import { first, firstValueFrom, reduce } from "rxjs";
import {
  createRandomWallet,
  fundAccount,
  makeIconAccount,
  SCENARIO_FUNDING_ICX,
} from "./fixtures";
import { getBridges, waitForTransaction } from "./helpers";
import { initIndexer, registerTransaction } from "./indexer";
import { buildIconSigner } from "./signer";

global.console = require("console");
jest.setTimeout(120_000);

describe("SODAX send-max", () => {
  it("sends the full spendable balance and drains the account to zero", async () => {
    const closeIndexer = initIndexer();
    try {
      const wallet = createRandomWallet();
      const address = wallet.getAddress();
      const recipient = createRandomWallet().getAddress();

      await fundAccount(address, SCENARIO_FUNDING_ICX);

      const signer = buildIconSigner(wallet.getPrivateKey());
      const { accountBridge } = getBridges(signer);

      let account = makeIconAccount(address);
      account = await firstValueFrom(
        accountBridge
          .sync(account, { paginationConfig: {} })
          .pipe(reduce((acc, f) => f(acc), account)),
      );

      const defaultTransaction = accountBridge.createTransaction(account);
      const sendMaxTransaction: Transaction = {
        ...defaultTransaction,
        recipient,
        useAllAmount: true,
      };

      const maxSpendable = await accountBridge.estimateMaxSpendable({
        account,
        parentAccount: null,
        transaction: sendMaxTransaction,
      });
      expect(maxSpendable.gt(0)).toBe(true);

      const prepared = await accountBridge.prepareTransaction(account, sendMaxTransaction);
      expect(prepared.stepLimit).toBeDefined();

      const status = await accountBridge.getTransactionStatus(account, prepared);
      // The send-max amount comes from the same spendable balance that
      // totalSpent is checked against, so the two meet exactly.
      expect(status.amount.toFixed()).toBe(
        account.spendableBalance.minus(status.estimatedFees).toFixed(),
      );
      expect(status.totalSpent.toFixed()).toBe(account.spendableBalance.toFixed());
      expect(status.errors).toEqual({});

      const { signedOperation } = await firstValueFrom(
        accountBridge
          .signOperation({ account, transaction: prepared, deviceId: "" })
          .pipe(first((e): e is SignOperationEvent & { type: "signed" } => e.type === "signed")),
      );

      const optimisticOperation = await accountBridge.broadcast({ signedOperation, account });
      await waitForTransaction(optimisticOperation.hash);
      registerTransaction(optimisticOperation.hash);

      account = await firstValueFrom(
        accountBridge
          .sync(
            { ...account, pendingOperations: [optimisticOperation] },
            { paginationConfig: {} },
          )
          .pipe(reduce((acc, f) => f(acc), account)),
      );

      expect(account.balance.toFixed()).toBe("0");
    } finally {
      closeIndexer();
    }
  });
});
