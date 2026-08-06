import { GOVERNANCE_SCORE_ADDRESS } from "@ledgerhq/coin-icon/constants";
import { convertICXtoLoop } from "@ledgerhq/coin-icon/logic";
import type { IconAccount, Transaction } from "@ledgerhq/coin-icon/types/index";
import type { AccountBridge, SignedOperation } from "@ledgerhq/types-live";
import { firstValueFrom, reduce } from "rxjs";
import {
  createRandomWallet,
  GENESIS_BALANCE_LOOP,
  makeIconAccount,
  TRANSFER_FEE_LOOP,
} from "./fixtures";
import { killGoloop, spawnGoloop } from "./goloop";
import { getBridges, waitForTransaction } from "./helpers";
import { initIndexer, registerTransaction } from "./indexer";
import { buildIconSigner } from "./signer";

global.console = require("console");
jest.setTimeout(600_000);

["exit", "SIGINT", "SIGQUIT", "SIGTERM", "SIGUSR1", "SIGUSR2", "uncaughtException"].forEach(e =>
  process.on(e, async () => {
    await killGoloop();
  }),
);

async function syncAccount(
  accountBridge: AccountBridge<Transaction, IconAccount>,
  account: IconAccount,
): Promise<IconAccount> {
  return firstValueFrom(
    accountBridge.sync(account, { paginationConfig: {} }).pipe(reduce((acc, f) => f(acc), account)),
  );
}

async function signTransaction(
  accountBridge: AccountBridge<Transaction, IconAccount>,
  account: IconAccount,
  transaction: Transaction,
): Promise<SignedOperation> {
  return new Promise((resolve, reject) => {
    accountBridge.signOperation({ account, transaction, deviceId: "" }).subscribe({
      next: event => {
        if (event.type === "signed") resolve(event.signedOperation);
      },
      error: reject,
    });
  });
}

// KNOWN LIMITATION, not the behaviour we want: getEstimatedFees always
// estimates against a dummy EOA recipient (ICON_DUMMY_ADDRESS), never the real
// one. A value transfer to a SCORE invokes its fallback method, which costs
// more steps than a plain EOA transfer, so the estimate under-provisions the
// step limit for every SCORE recipient. The transaction lands, runs out of
// steps and reverts, consuming the full step limit as its fee. Any send to a
// SCORE address therefore fails, and the assertions below pin that failure.
// Estimating against the real recipient is the fix; this test must be updated
// to expect a finalized transfer once coin-icon does that.
describe("SODAX reverted transfer", () => {
  let closeIndexer: (() => void) | undefined;
  let accountBridge: AccountBridge<Transaction, IconAccount>;
  let account: IconAccount;

  beforeAll(async () => {
    const devWallet = createRandomWallet();
    const devAddress = devWallet.getAddress();
    process.env.DEV_ADDRESS = devAddress;

    await spawnGoloop();
    closeIndexer = initIndexer();

    const signer = buildIconSigner(devWallet.getPrivateKey());
    const { accountBridge: bridge } = getBridges(signer);
    accountBridge = bridge;

    account = await syncAccount(accountBridge, makeIconAccount(devAddress));
    expect(account.balance.toFixed()).toBe(GENESIS_BALANCE_LOOP.toFixed());
  });

  afterAll(async () => {
    closeIndexer?.();
    await killGoloop();
  });

  it("reports hasFailed and the charged step cost when a transfer reverts on-chain", async () => {
    let transaction = accountBridge.createTransaction(account);
    transaction = accountBridge.updateTransaction(transaction, {
      recipient: GOVERNANCE_SCORE_ADDRESS,
      amount: convertICXtoLoop(5),
    });
    transaction = await accountBridge.prepareTransaction(account, transaction);

    const status = await accountBridge.getTransactionStatus(account, transaction);
    expect(status.errors).toEqual({});

    const signedOperation = await signTransaction(accountBridge, account, transaction);
    const optimistic = await accountBridge.broadcast({ account, signedOperation });
    await waitForTransaction(optimistic.hash);
    registerTransaction(optimistic.hash);

    const synced = await syncAccount(accountBridge, account);
    const operation = synced.operations.find(op => op.hash === optimistic.hash);

    expect(operation).toBeDefined();
    expect(operation!.hasFailed).toBe(true);
    // OutOfStep consumes the whole step limit, and the limit the estimate set
    // is the plain-transfer step count, so the charged fee coincides with
    // TRANSFER_FEE_LOOP rather than being a transfer's own cost.
    expect(operation!.fee.toFixed()).toBe(TRANSFER_FEE_LOOP.toFixed());
    expect(operation!.value.toFixed()).toBe(TRANSFER_FEE_LOOP.toFixed());
    expect(synced.balance.toFixed()).toBe(GENESIS_BALANCE_LOOP.minus(TRANSFER_FEE_LOOP).toFixed());
  });
});
