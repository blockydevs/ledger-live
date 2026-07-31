import BigNumber from "bignumber.js";
import { firstValueFrom, reduce } from "rxjs";
import type { AccountBridge } from "@ledgerhq/types-live";
import { LiveConfig } from "@ledgerhq/live-config/LiveConfig";
import { Scenario, ScenarioTransaction } from "@ledgerhq/coin-tester/main";
import { createBridges } from "@ledgerhq/coin-casper/bridge";
import { setCoinConfig } from "@ledgerhq/coin-casper/config";
import { CASPER_FEES_MOTES, CASPER_MINIMUM_VALID_AMOUNT_MOTES } from "@ledgerhq/coin-casper/consts";
import resolver from "@ledgerhq/coin-casper/signer";
import type { CasperAccount, Transaction } from "@ledgerhq/coin-casper/types";
import { deriveUser } from "../casperDevnet";
import {
  GENESIS_USER_BALANCE_MOTES,
  LARGE_TRANSFER_ID,
  liveDerivationPath,
  makeAccount,
  RECIPIENT_USER_INDEX,
  scenarioCoinConfig,
  SENDER_USER_INDEX,
  TRANSFER_AMOUNT_MOTES,
  TRANSFER_ID,
} from "../fixtures";
import { indexTransfer, startIndexer } from "../indexer";
import { buildCasperSigner } from "../signer";

const feesMotes = new BigNumber(CASPER_FEES_MOTES);
const minimumValidAmountMotes = new BigNumber(CASPER_MINIMUM_VALID_AMOUNT_MOTES);

// `afterAll` only receives the scenario account, so these are held module-scope.
let bridge: AccountBridge<Transaction, CasperAccount>;
let recipientAccount: CasperAccount;
let recipientBalanceBefore: BigNumber;
let recipientPublicKey: string;
let senderAccountHash: string;
let recipientAccountHash: string;
let closeIndexer: () => void;

const syncAccount = (
  bridge: AccountBridge<Transaction, CasperAccount>,
  account: CasperAccount,
): Promise<CasperAccount> =>
  firstValueFrom(
    bridge.sync(account, { paginationConfig: {} }).pipe(reduce((acc, f) => f(acc), account)),
  );

async function retryAssert(assert: () => Promise<void>, retriesLeft = 20): Promise<void> {
  try {
    await assert();
  } catch (error) {
    if (retriesLeft === 0) throw error;
    await new Promise(resolve => setTimeout(resolve, 3 * 1000));
    await retryAssert(assert, retriesLeft - 1);
  }
}

type CasperOperation = CasperAccount["operations"][number];

// Shared by the fixed-amount sends: an OUT op debiting amount + fee, the
// sender/recipient hashes, and the balance drop.
function expectFixedSend(
  previousAccount: CasperAccount,
  currentAccount: CasperAccount,
  operation: CasperOperation,
  amount: BigNumber,
) {
  expect(operation.type).toBe("OUT");
  expect(operation.value.toFixed()).toBe(amount.plus(feesMotes).toFixed());
  expect(operation.fee.toFixed()).toBe(feesMotes.toFixed());
  expect(operation.senders).toEqual([senderAccountHash]);
  expect(operation.recipients).toEqual([recipientAccountHash]);
  expect(operation.hasFailed).toBe(false);

  // Pins CASPER_FEES_MOTES against the chain's real flat transfer cost.
  expect(currentAccount.balance.toFixed()).toBe(
    previousAccount.balance.minus(operation.value).toFixed(),
  );
}

const transferTransaction = (): ScenarioTransaction<Transaction, CasperAccount> => ({
  name: "Send 10 CSPR",
  recipient: recipientPublicKey,
  amount: TRANSFER_AMOUNT_MOTES,
  transferId: TRANSFER_ID,
  expect: (previousAccount, currentAccount) => {
    // Asserted before reading the operation, so a still-settling chain keeps
    // retrying instead of throwing a TypeError on an empty operations array.
    expect(currentAccount.operations.length - previousAccount.operations.length).toBe(1);
    const [operation] = currentAccount.operations;

    expectFixedSend(previousAccount, currentAccount, operation, TRANSFER_AMOUNT_MOTES);
    expect(operation.extra).toMatchObject({ transferId: TRANSFER_ID });
  },
});

const transferWithoutIdTransaction = (): ScenarioTransaction<Transaction, CasperAccount> => ({
  name: "Send 10 CSPR with no transfer id",
  recipient: recipientPublicKey,
  amount: TRANSFER_AMOUNT_MOTES,
  expect: (previousAccount, currentAccount) => {
    expect(currentAccount.operations.length - previousAccount.operations.length).toBe(1);
    const [operation] = currentAccount.operations;

    expectFixedSend(previousAccount, currentAccount, operation, TRANSFER_AMOUNT_MOTES);
    // A send with no transfer id carries no id argument in the signed bytes,
    // and buildOptimisticOperation leaves extra.transferId undefined to match.
    expect((operation.extra as { transferId?: string }).transferId).toBeUndefined();
  },
});

const minimumAmountTransaction = (): ScenarioTransaction<Transaction, CasperAccount> => ({
  name: "Send the minimum valid amount",
  recipient: recipientPublicKey,
  amount: minimumValidAmountMotes,
  expect: (previousAccount, currentAccount) => {
    expect(currentAccount.operations.length - previousAccount.operations.length).toBe(1);
    const [operation] = currentAccount.operations;

    // Exactly at the minimum passes; a module change from `lt` to `lte` would fail only here.
    expectFixedSend(previousAccount, currentAccount, operation, minimumValidAmountMotes);
  },
});

const largeTransferIdTransaction = (): ScenarioTransaction<Transaction, CasperAccount> => ({
  name: "Send 10 CSPR with a large transfer id",
  recipient: recipientPublicKey,
  amount: TRANSFER_AMOUNT_MOTES,
  transferId: LARGE_TRANSFER_ID,
  expect: (previousAccount, currentAccount) => {
    expect(currentAccount.operations.length - previousAccount.operations.length).toBe(1);
    const [operation] = currentAccount.operations;

    expectFixedSend(previousAccount, currentAccount, operation, TRANSFER_AMOUNT_MOTES);
    expect(operation.extra).toMatchObject({ transferId: LARGE_TRANSFER_ID });
  },
});

const sendMaxTransaction = (): ScenarioTransaction<Transaction, CasperAccount> => ({
  name: "Send max",
  recipient: recipientPublicKey,
  useAllAmount: true,
  expect: (previousAccount, currentAccount) => {
    expect(currentAccount.operations.length - previousAccount.operations.length).toBe(1);
    const [operation] = currentAccount.operations;

    expect(operation.type).toBe("OUT");
    expect(operation.hasFailed).toBe(false);
    expect(operation.fee.toFixed()).toBe(feesMotes.toFixed());

    // prepareTransaction's spendableBalance − fees and buildOptimisticOperation's
    // fee-added-back-in must cancel out to the whole previous balance.
    expect(operation.value.toFixed()).toBe(previousAccount.spendableBalance.toFixed());

    // Holds only if the chain's real gas cost equals CASPER_FEES_MOTES to the mote.
    expect(currentAccount.balance.toFixed()).toBe("0");
  },
});

export const scenarioCasper: Scenario<Transaction, CasperAccount> = {
  name: "Casper devnet transfer",

  setup: async () => {
    closeIndexer = startIndexer();

    setCoinConfig(() => scenarioCoinConfig);
    LiveConfig.setConfig({
      config_currency_casper: { type: "object", default: scenarioCoinConfig },
    });

    const sender = await deriveUser(SENDER_USER_INDEX);
    const recipient = await deriveUser(RECIPIENT_USER_INDEX);
    senderAccountHash = sender.accountHash;
    recipientAccountHash = recipient.accountHash;
    recipientPublicKey = recipient.publicKey;

    const signer = buildCasperSigner({
      [liveDerivationPath(SENDER_USER_INDEX)]: sender.secretKey,
      [liveDerivationPath(RECIPIENT_USER_INDEX)]: recipient.secretKey,
    });
    const signerContext: Parameters<typeof resolver>[0] = (_, fn) => fn(signer);

    const { accountBridge, currencyBridge } = createBridges(
      signerContext,
      () => scenarioCoinConfig,
    );

    const account = makeAccount({ publicKey: sender.publicKey, index: SENDER_USER_INDEX });

    bridge = accountBridge;
    recipientAccount = await syncAccount(
      accountBridge,
      makeAccount({ publicKey: recipient.publicKey, index: RECIPIENT_USER_INDEX }),
    );
    recipientBalanceBefore = recipientAccount.balance;

    return { accountBridge, currencyBridge, account, retryLimit: 20 };
  },

  getTransactions: () => [
    transferTransaction(),
    transferWithoutIdTransaction(),
    minimumAmountTransaction(),
    largeTransferIdTransaction(),
    sendMaxTransaction(),
  ],

  mockIndexer: async (_account, optimistic) => {
    await indexTransfer(optimistic.hash);
  },

  afterAll: async account => {
    const outOps = account.operations.filter(op => op.type === "OUT");
    expect(outOps).toHaveLength(5);
    expect(account.balance.toFixed()).toBe("0");

    await retryAssert(async () => {
      const recipient = await syncAccount(bridge, recipientAccount);
      const inOps = recipient.operations.filter(op => op.type === "IN");

      expect(inOps).toHaveLength(5);
      expect(inOps.map(op => op.hash).sort()).toEqual(outOps.map(op => op.hash).sort());

      inOps.forEach(operation => {
        const out = outOps.find(o => o.hash === operation.hash)!;
        // mapTxToOps adds the fee only on the OUT side.
        expect(operation.value.toFixed()).toBe(out.value.minus(feesMotes).toFixed());
        // Pins current behaviour: the recipient pays nothing, yet mapTxToOps
        // copies the fee onto the IN operation too.
        expect(operation.fee.toFixed()).toBe(feesMotes.toFixed());
        expect(operation.senders).toEqual([senderAccountHash]);
        expect(operation.recipients).toEqual([recipientAccountHash]);
        expect(operation.hasFailed).toBe(false);
      });

      // Sender goes genesis balance → 0 across five fees, so the recipient
      // gets the rest — holds without knowing the send-max amount up front.
      expect(recipient.balance.minus(recipientBalanceBefore).toFixed()).toBe(
        GENESIS_USER_BALANCE_MOTES.minus(feesMotes.times(5)).toFixed(),
      );
    });
  },

  teardown: async () => {
    closeIndexer?.();
  },
};
