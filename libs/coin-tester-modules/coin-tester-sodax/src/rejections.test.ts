import { EXISTENTIAL_DEPOSIT, convertICXtoLoop } from "@ledgerhq/coin-icon/logic";
import type { IconAccount, Transaction } from "@ledgerhq/coin-icon/types/index";
import {
  AmountRequired,
  FeeNotLoaded,
  InvalidAddress,
  InvalidAddressBecauseDestinationIsAlsoSource,
  NotEnoughBalance,
  RecipientRequired,
} from "@ledgerhq/ledger-wallet-framework/errors";
import type { AccountBridge } from "@ledgerhq/types-live";
import BigNumber from "bignumber.js";
import { firstValueFrom, reduce } from "rxjs";
import { IconDoMaxSendInstead } from "@ledgerhq/coin-icon/errors";
import { createRandomWallet, makeIconAccount } from "./fixtures";
import { killGoloop, spawnGoloop } from "./goloop";
import { getBridges } from "./helpers";
import { initIndexer } from "./indexer";
import { buildIconSigner } from "./signer";

global.console = require("console");
jest.setTimeout(120_000);

["exit", "SIGINT", "SIGQUIT", "SIGTERM", "SIGUSR1", "SIGUSR2", "uncaughtException"].forEach(e =>
  process.on(e, async () => {
    await killGoloop();
  }),
);

let accountBridge: AccountBridge<Transaction, IconAccount>;
let account: IconAccount;
let recipientAddress: string;
let closeIndexer: (() => void) | undefined;

async function prepared(patch: Partial<Transaction>): Promise<Transaction> {
  const transaction = accountBridge.updateTransaction(
    accountBridge.createTransaction(account),
    patch,
  );
  return accountBridge.prepareTransaction(account, transaction);
}

describe("SODAX rejection matrix", () => {
  beforeAll(async () => {
    const wallet = createRandomWallet();
    const address = wallet.getAddress();
    process.env.DEV_ADDRESS = address;

    await spawnGoloop();
    closeIndexer = initIndexer();

    const signer = buildIconSigner(wallet.getPrivateKey());
    const bridges = getBridges(signer);
    accountBridge = bridges.accountBridge;

    recipientAddress = createRandomWallet().getAddress();

    const freshAccount = makeIconAccount(address);
    account = await firstValueFrom(
      accountBridge
        .sync(freshAccount, { paginationConfig: {} })
        .pipe(reduce((acc, f) => f(acc), freshAccount)),
    );
  });

  afterAll(async () => {
    closeIndexer?.();
    await killGoloop();
  });

  it("rejects an empty recipient with RecipientRequired", async () => {
    const transaction = await prepared({ recipient: "", amount: convertICXtoLoop(1) });
    const status = await accountBridge.getTransactionStatus(account, transaction);
    expect(status.errors.recipient).toBeInstanceOf(RecipientRequired);
  });

  it("rejects the sender as recipient with InvalidAddressBecauseDestinationIsAlsoSource", async () => {
    const transaction = await prepared({
      recipient: account.freshAddress,
      amount: convertICXtoLoop(1),
    });
    const status = await accountBridge.getTransactionStatus(account, transaction);
    expect(status.errors.recipient).toBeInstanceOf(InvalidAddressBecauseDestinationIsAlsoSource);
  });

  it("rejects a malformed recipient with InvalidAddress", async () => {
    // isValidAddress is /^[a-z0-9]{42}$/, no separate `hx`-prefix check, so an
    // uppercase character is what actually breaks it.
    const malformed = `${recipientAddress.slice(0, -1)}G`;
    const transaction = await prepared({ recipient: malformed, amount: convertICXtoLoop(1) });
    const status = await accountBridge.getTransactionStatus(account, transaction);
    expect(status.errors.recipient).toBeInstanceOf(InvalidAddress);
  });

  it("rejects a zero amount with AmountRequired", async () => {
    const transaction = await prepared({ recipient: recipientAddress, amount: new BigNumber(0) });
    const status = await accountBridge.getTransactionStatus(account, transaction);
    expect(status.errors.amount).toBeInstanceOf(AmountRequired);
  });

  it("rejects an amount above the balance with NotEnoughBalance", async () => {
    const transaction = await prepared({
      recipient: recipientAddress,
      amount: account.spendableBalance.plus(convertICXtoLoop(1)),
    });
    const status = await accountBridge.getTransactionStatus(account, transaction);
    expect(status.errors.amount).toBeInstanceOf(NotEnoughBalance);
  });

  it("rejects an unloaded fee with FeeNotLoaded", async () => {
    const transaction = await prepared({
      recipient: recipientAddress,
      amount: convertICXtoLoop(1),
    });
    const status = await accountBridge.getTransactionStatus(account, {
      ...transaction,
      fees: null,
    });
    expect(status.errors.fees).toBeInstanceOf(FeeNotLoaded);
  });

  it("rejects a leftover below the minimum balance with IconDoMaxSendInstead", async () => {
    const probe = await prepared({ recipient: recipientAddress, amount: new BigNumber(1) });
    const fee = probe.fees as BigNumber;
    const amount = account.spendableBalance.minus(fee).minus(EXISTENTIAL_DEPOSIT.div(2));

    const transaction = await prepared({ recipient: recipientAddress, amount });
    const status = await accountBridge.getTransactionStatus(account, transaction);
    expect(status.errors.amount).toBeInstanceOf(IconDoMaxSendInstead);
  });
});
