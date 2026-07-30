import BigNumber from "bignumber.js";
import { firstValueFrom, reduce } from "rxjs";
import type { AccountBridge } from "@ledgerhq/types-live";
import { LiveConfig } from "@ledgerhq/live-config/LiveConfig";
import { Scenario, ScenarioTransaction } from "@ledgerhq/coin-tester/main";
import { createBridges } from "@ledgerhq/coin-casper/bridge";
import { setCoinConfig } from "@ledgerhq/coin-casper/config";
import { CASPER_FEES_MOTES } from "@ledgerhq/coin-casper/consts";
import resolver from "@ledgerhq/coin-casper/signer";
import type { CasperAccount, Transaction } from "@ledgerhq/coin-casper/types";
import { deriveUser, killDevnet, spawnDevnet } from "../casperDevnet";
import {
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

// `afterAll` only receives the scenario account, so the recipient's bridge,
// account and pre-transfer balance are held here.
let recipientBridge: AccountBridge<Transaction, CasperAccount>;
let recipientAccount: CasperAccount;
let recipientBalanceBefore: BigNumber;
let recipientPublicKey: string;
let senderAccountHash: string;
let recipientAccountHash: string;
let sentOperationHash: string;
let devnetStopped = false;
let closeIndexer: () => void;

const syncAccount = (
  bridge: AccountBridge<Transaction, CasperAccount>,
  account: CasperAccount,
): Promise<CasperAccount> =>
  firstValueFrom(
    bridge.sync(account, { paginationConfig: {} }).pipe(reduce((acc, f) => f(acc), account)),
  );

const transferTransaction = (): ScenarioTransaction<Transaction, CasperAccount> => ({
  name: "Send 10 CSPR",
  recipient: recipientPublicKey,
  amount: TRANSFER_AMOUNT_MOTES,
  transferId: TRANSFER_ID,
  expect: (previousAccount, currentAccount) => {
    const [operation] = currentAccount.operations;

    expect(currentAccount.operations.length - previousAccount.operations.length).toBe(1);
    expect(operation.type).toBe("OUT");
    expect(operation.value.toFixed()).toBe(TRANSFER_AMOUNT_MOTES.plus(feesMotes).toFixed());
    expect(operation.fee.toFixed()).toBe(feesMotes.toFixed());
    expect(operation.senders).toEqual([senderAccountHash]);
    expect(operation.recipients).toEqual([recipientAccountHash]);
    expect(operation.extra).toMatchObject({ transferId: TRANSFER_ID });
    expect(operation.hasFailed).toBe(false);

    // The only on-chain settlement check in this scenario. expectHandler
    // re-syncs until the assertions pass, so this is what waits for the chain;
    // a rejected transaction never lowers the balance.
    //
    // Equality against the operation's own value also pins the module's fee
    // constant against the chain. The devnet charges a flat 100000000 motes for
    // a native transfer (mint_costs.transfer, with min_gas_price =
    // max_gas_price = 1), which is exactly CASPER_FEES_MOTES. If a future image
    // charges anything else, coin-casper's hardcoded fee is wrong and this is
    // the assertion that says so.
    expect(currentAccount.balance.toFixed()).toBe(
      previousAccount.balance.minus(operation.value).toFixed(),
    );
  },
});

export const scenarioCasper: Scenario<Transaction, CasperAccount> = {
  name: "Casper devnet transfer",

  setup: async () => {
    devnetStopped = false;
    closeIndexer = startIndexer();
    await spawnDevnet();

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

    recipientBridge = accountBridge;
    recipientAccount = await syncAccount(
      accountBridge,
      makeAccount({ publicKey: recipient.publicKey, index: RECIPIENT_USER_INDEX }),
    );
    recipientBalanceBefore = recipientAccount.balance;

    return { accountBridge, currencyBridge, account, retryLimit: 20 };
  },

  getTransactions: () => [transferTransaction()],

  mockIndexer: async (_account, optimistic) => {
    sentOperationHash = optimistic.hash;
    indexTransfer(optimistic);
  },

  afterAll: async () => {
    // One pass, no retry loop: the sender's balance already dropped, so the
    // transfer settled, and the recipient is written by the same execution effect.
    const account = await syncAccount(recipientBridge, recipientAccount);
    const [operation] = account.operations;

    expect(account.operations).toHaveLength(1);
    expect(operation.type).toBe("IN");
    expect(operation.hash).toBe(sentOperationHash);
    expect(operation.value.toFixed()).toBe(TRANSFER_AMOUNT_MOTES.toFixed());
    // mapTxToOps sets fee on IN as well. The recipient pays nothing; this pins
    // the module's current behaviour, not domain correctness.
    expect(operation.fee.toFixed()).toBe(feesMotes.toFixed());
    expect(operation.senders).toEqual([senderAccountHash]);
    expect(operation.recipients).toEqual([recipientAccountHash]);
    expect(operation.hasFailed).toBe(false);
    // Equality, not a range: the recipient pays no fee and the account has no
    // other activity.
    expect(account.balance.minus(recipientBalanceBefore).toFixed()).toBe(
      TRANSFER_AMOUNT_MOTES.toFixed(),
    );
  },

  teardown: async () => {
    // executeScenario calls teardown on the success path and again from the
    // catch block if the first call throws.
    if (devnetStopped) return;
    devnetStopped = true;
    try {
      await killDevnet();
    } finally {
      closeIndexer();
    }
  },
};
