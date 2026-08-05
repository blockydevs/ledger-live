import type { IconAccount, Transaction } from "@ledgerhq/coin-icon/types/index";
import { convertICXtoLoop } from "@ledgerhq/coin-icon/logic";
import type { AccountBridge, SignedOperation } from "@ledgerhq/types-live";
import { http, HttpResponse } from "msw";
import { firstValueFrom, reduce } from "rxjs";
import { createRandomWallet, GOLOOP_DEBUG_RPC, makeIconAccount } from "./fixtures";
import { killGoloop, spawnGoloop } from "./goloop";
import { getBridges, waitForTransaction } from "./helpers";
import { initIndexer, registerTransaction } from "./indexer";
import { buildIconSigner } from "./signer";

global.console = require("console");
jest.setTimeout(120_000);

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

// The debug endpoint's icx_estimateStep is the only call getFeesForTransaction
// makes against GOLOOP_DEBUG_RPC, so forcing every response on that endpoint
// to "0x0" reproduces the estimate-comes-back-zero case without needing a
// devnet-specific transaction shape to trigger it naturally.
const forceZeroStepEstimate = http.post(GOLOOP_DEBUG_RPC, async ({ request }) => {
  const body = (await request.json()) as { id: number };
  return HttpResponse.json({ jsonrpc: "2.0", id: body.id, result: "0x0" });
});

describe("SODAX DEFAULT_STEP_LIMIT fallback", () => {
  let closeIndexer: (() => void) | undefined;
  let accountBridge: AccountBridge<Transaction, IconAccount>;
  let account: IconAccount;

  beforeAll(async () => {
    const devWallet = createRandomWallet();
    const devAddress = devWallet.getAddress();
    process.env.DEV_ADDRESS = devAddress;

    await spawnGoloop();
    closeIndexer = initIndexer([forceZeroStepEstimate]);

    const signer = buildIconSigner(devWallet.getPrivateKey());
    const { accountBridge: bridge } = getBridges(signer);
    accountBridge = bridge;

    account = await syncAccount(accountBridge, makeIconAccount(devAddress));
  });

  afterAll(async () => {
    closeIndexer?.();
    await killGoloop();
  });

  it("still lands a plain transfer when the node's step estimate comes back zero", async () => {
    const recipient = createRandomWallet().getAddress();

    let transaction = accountBridge.createTransaction(account);
    transaction = accountBridge.updateTransaction(transaction, {
      recipient,
      amount: convertICXtoLoop(5),
    });
    transaction = await accountBridge.prepareTransaction(account, transaction);

    // A real transfer's step cost is far above the old, undersized fallback;
    // the fix's fallback stays large enough for the transaction to finalize
    // instead of running out of steps and reverting.
    expect(transaction.stepLimit).toBeDefined();

    const signedOperation = await signTransaction(accountBridge, account, transaction);
    const optimistic = await accountBridge.broadcast({ account, signedOperation });
    await waitForTransaction(optimistic.hash);
    registerTransaction(optimistic.hash);

    const synced = await syncAccount(accountBridge, account);
    const operation = synced.operations.find(op => op.hash === optimistic.hash);

    expect(operation).toBeDefined();
    expect(operation!.hasFailed).toBe(false);
    expect(operation!.value.toFixed()).toBe(convertICXtoLoop(5).plus(operation!.fee).toFixed());
  });
});
