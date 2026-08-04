import { getStepPrice } from "@ledgerhq/coin-icon/api/node";
import { convertICXtoLoop } from "@ledgerhq/coin-icon/logic";
import type { IconAccount, Transaction } from "@ledgerhq/coin-icon/types/index";
import { Scenario, ScenarioTransaction } from "@ledgerhq/coin-tester/main";
import type { AccountBridge } from "@ledgerhq/types-live";
import BigNumber from "bignumber.js";
import { firstValueFrom, reduce } from "rxjs";
import {
  createRandomWallet,
  GENESIS_BALANCE_LOOP,
  icon,
  makeIconAccount,
  STEP_PRICE,
  TRANSFER_FEE_LOOP,
} from "../fixtures";
import { killGoloop, spawnGoloop } from "../goloop";
import { getBridges, waitForTransaction } from "../helpers";
import { initIndexer, registerTransaction } from "../indexer";
import { buildIconSigner } from "../signer";

type IconScenarioTransaction = ScenarioTransaction<Transaction, IconAccount>;

// afterAll drives a second sync over the recipient address, which the
// Scenario type has no slot for, so setup stashes the bridge here.
let sodaxAccountBridge: AccountBridge<Transaction, IconAccount> | undefined;
let closeIndexer: (() => void) | undefined;
let recipientAddress = "";

// Leaves a non-trivial remainder (~6.47 ICX net of these three fees) for the
// trailing send-max leg to sweep.
const TRANSFERS_ICX = [1, 2.5, 999_990];

// Set by the send-max leg's expect callback once the swept amount is known;
// afterAll needs it to check the recipient's final balance.
let sweptLoop = new BigNumber(0);

function makeTransactions(): IconScenarioTransaction[] {
  const explicitTransfers: IconScenarioTransaction[] = TRANSFERS_ICX.map(amountIcx => ({
    name: `Send ${amountIcx} ICX`,
    amount: convertICXtoLoop(amountIcx),
    recipient: recipientAddress,
    expect: (previous, current) => {
      const [latest] = current.operations;
      expect(current.operations.length - previous.operations.length).toBe(1);
      expect(latest.type).toBe("OUT");
      expect(latest.hasFailed).toBe(false);
      expect(latest.fee.toFixed()).toBe(TRANSFER_FEE_LOOP.toFixed());
      expect(latest.value.toFixed()).toBe(
        TRANSFER_FEE_LOOP.plus(convertICXtoLoop(amountIcx)).toFixed(),
      );
      expect(current.balance.toFixed()).toBe(previous.balance.minus(latest.value).toFixed());
      expect(latest.senders).toEqual([current.freshAddress]);
      expect(latest.recipients).toEqual([recipientAddress]);
    },
  }));

  const sendMax: IconScenarioTransaction = {
    name: "Send max ICX",
    useAllAmount: true,
    recipient: recipientAddress,
    expect: (previous, current) => {
      const [latest] = current.operations;
      expect(current.operations.length - previous.operations.length).toBe(1);
      expect(latest.type).toBe("OUT");
      expect(latest.hasFailed).toBe(false);
      expect(latest.fee.toFixed()).toBe(TRANSFER_FEE_LOOP.toFixed());
      expect(latest.senders).toEqual([current.freshAddress]);
      expect(latest.recipients).toEqual([recipientAddress]);
      // A send-max sweeps the whole balance, so the fee-inclusive OUT value is
      // exactly what the account held beforehand.
      expect(latest.value.toFixed()).toBe(previous.balance.toFixed());
      expect(current.balance.toFixed()).toBe(previous.balance.minus(latest.value).toFixed());
      // Catches a wrong send-max estimate: an under- or over-estimated fee
      // leaves loop dust behind or fails the broadcast outright.
      expect(current.balance.toFixed()).toBe("0");
      sweptLoop = latest.value.minus(latest.fee);
    },
  };

  return [...explicitTransfers, sendMax];
}

export const scenarioSodax: Scenario<Transaction, IconAccount> = {
  name: "Ledger Live Basic ICX Transactions",

  setup: async () => {
    // Fresh dev and recipient wallets per run exercise key derivation and
    // signing for real, rather than replaying hardcoded keys. entrypoint.sh
    // reads DEV_ADDRESS from the environment to pre-fund it at genesis.
    const devWallet = createRandomWallet();
    const devAddress = devWallet.getAddress();
    recipientAddress = createRandomWallet().getAddress();
    process.env.DEV_ADDRESS = devAddress;

    await spawnGoloop();
    closeIndexer = initIndexer();

    const signer = buildIconSigner(devWallet.getPrivateKey());
    const { currencyBridge, accountBridge, getAddress } = getBridges(signer);
    sodaxAccountBridge = accountBridge;

    const account = makeIconAccount(devAddress);

    // A key mismatch between the signer and the genesis balance would otherwise
    // surface as a zero-balance sync.
    const { address } = await getAddress("", {
      path: account.freshAddressPath,
      currency: icon,
      derivationMode: account.derivationMode,
    });
    expect(address).toBe(devAddress);

    return { currencyBridge, accountBridge, account, retryInterval: 1000, retryLimit: 20 };
  },

  getTransactions: () => makeTransactions(),

  mockIndexer: async (_account, optimistic) => {
    await waitForTransaction(optimistic.hash);
    registerTransaction(optimistic.hash);
  },

  beforeAll: async account => {
    expect(account.balance.toFixed()).toBe(GENESIS_BALANCE_LOOP.toFixed());
    expect(account.spendableBalance.toFixed()).toBe(GENESIS_BALANCE_LOOP.toFixed());
    expect(account.operations.length).toBe(0);
    expect(account.iconResources.totalDelegated.toString()).toBe("0");
    expect(account.iconResources.votingPower.toString()).toBe("0");
    expect((await getStepPrice(account)).toFixed()).toBe(STEP_PRICE.toFixed());
  },

  afterAll: async account => {
    expect(account.operations.length).toBe(TRANSFERS_ICX.length + 1);
    expect(account.operations.every(op => op.type === "OUT")).toBe(true);
    expect(account.balance.toFixed()).toBe("0");

    if (!sodaxAccountBridge) throw new Error("accountBridge missing in afterAll");
    const recipientAccount = makeIconAccount(recipientAddress);
    const recipient = await firstValueFrom(
      sodaxAccountBridge
        .sync(recipientAccount, { paginationConfig: {} })
        .pipe(reduce((acc, f) => f(acc), recipientAccount)),
    );
    const totalSentLoop = TRANSFERS_ICX.reduce(
      (sum, amountIcx) => sum.plus(convertICXtoLoop(amountIcx)),
      new BigNumber(0),
    ).plus(sweptLoop);
    expect(recipient.operations.length).toBe(TRANSFERS_ICX.length + 1);
    expect(recipient.operations.every(op => op.type === "IN")).toBe(true);
    expect(recipient.balance.toFixed()).toBe(totalSentLoop.toFixed());
  },

  teardown: async () => {
    closeIndexer?.();
    await killGoloop();
  },
};
