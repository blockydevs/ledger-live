import BigNumber from "bignumber.js";
import getDeviceTransactionConfig from "@ledgerhq/coin-multiversx/deviceTransactionConfig";
import transactionModule from "@ledgerhq/coin-multiversx/transaction";
import type { Transaction, TransactionStatus } from "@ledgerhq/coin-multiversx/types";
import { getCryptoCurrencyById } from "@domain/entity-currency-crypto";
import type { Account } from "@ledgerhq/types-live";
import { createTransaction } from "../../bridge/generic-coin-framework/createTransaction";

// On the generic bridge the app still serializes and confirms MultiversX transactions with the coin
// module's `transaction` and `deviceTransactionConfig` (the `loadTransaction`/`loadDeviceTxConfig`
// loaders). The generic transaction differs from the legacy one: it has no gas limit until fees are
// estimated, then holds it as a BigNumber.

const PROVIDER = "erd1qqqqqqqqqqqqqqqpqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqzllls8a5w6u";
const account = {
  type: "Account",
  currency: getCryptoCurrencyById("elrond"),
} as unknown as Account;

function genericUnDelegate(): Transaction {
  return {
    ...createTransaction(account),
    mode: "unDelegate",
    recipient: PROVIDER,
    amount: new BigNumber("1000000000000000000"),
    fees: new BigNumber("150500000000000"),
    gasLimit: new BigNumber(12_000_000),
  } as unknown as Transaction;
}

describe("MultiversX transaction modules with a generic bridge transaction", () => {
  it("keeps the mode, amount and fees through a stored raw transaction", () => {
    const stored = JSON.parse(
      JSON.stringify(transactionModule.toTransactionRaw(genericUnDelegate())),
    );

    const restored = transactionModule.fromTransactionRaw(stored);

    expect(restored).toMatchObject({
      family: "multiversx",
      mode: "unDelegate",
      recipient: PROVIDER,
      amount: new BigNumber("1000000000000000000"),
      fees: new BigNumber("150500000000000"),
    });
    expect(new BigNumber(restored.gasLimit).toNumber()).toBe(12_000_000);
  });

  it("restores the default transaction, which has no gas limit yet", () => {
    const defaults = transactionModule.fromTransactionRaw(
      transactionModule.toTransactionRaw(createTransaction(account) as unknown as Transaction),
    );

    expect(defaults).toMatchObject({ mode: "send", fees: null });
    expect(defaults.gasLimit).toBeUndefined();
  });

  it("shows the device fields of the MultiversX mode it carries", async () => {
    const fields = await getDeviceTransactionConfig({
      account,
      transaction: genericUnDelegate(),
      status: { estimatedFees: new BigNumber("150500000000000") } as TransactionStatus,
    });

    expect(fields.map(f => f.label)).toEqual(["Receiver", "Amount", "Fee"]);
    // An undelegation moves no EGLD out of the balance, so the device shows a zero amount.
    expect(fields[1]).toMatchObject({ type: "text", value: expect.stringMatching(/^0\sEGLD$/) });
  });
});
