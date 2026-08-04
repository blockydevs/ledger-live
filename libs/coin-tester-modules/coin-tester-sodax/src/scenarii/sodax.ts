import { getStepPrice } from "@ledgerhq/coin-icon/api/node";
import { convertICXtoLoop } from "@ledgerhq/coin-icon/logic";
import type { IconAccount, Transaction } from "@ledgerhq/coin-icon/types/index";
import { Scenario, ScenarioTransaction } from "@ledgerhq/coin-tester/main";
import type { AccountBridge } from "@ledgerhq/types-live";
import BigNumber from "bignumber.js";
import { firstValueFrom, reduce } from "rxjs";
import {
  createRandomWallet,
  fundAccount,
  icon,
  makeIconAccount,
  SCENARIO_FUNDING_ICX,
  STEP_PRICE,
  TRANSFER_FEE_LOOP,
} from "../fixtures";
import { getBridges, waitForTransaction } from "../helpers";
import { initIndexer, registerTransaction } from "../indexer";
import { buildIconSigner } from "../signer";

type IconScenarioTransaction = ScenarioTransaction<Transaction, IconAccount>;

// afterAll drives a second sync over the recipient address, which the
// Scenario type has no slot for, so setup stashes the bridge here.
let sodaxAccountBridge: AccountBridge<Transaction, IconAccount> | undefined;
let closeIndexer: (() => void) | undefined;
let recipientAddress = "";

const TRANSFERS_ICX = [1, 2.5, 999_996.38];
const totalSentLoop = TRANSFERS_ICX.reduce(
  (sum, amountIcx) => sum.plus(convertICXtoLoop(amountIcx)),
  new BigNumber(0),
);

function makeTransactions(): IconScenarioTransaction[] {
  return TRANSFERS_ICX.map((amountIcx, index) => ({
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
      if (index === TRANSFERS_ICX.length - 1) {
        expect(current.balance.lt(convertICXtoLoop(0.2))).toBe(true);
      }
    },
  }));
}

export const scenarioSodax: Scenario<Transaction, IconAccount> = {
  name: "Ledger Live Basic ICX Transactions",

  setup: async () => {
    // Fresh dev and recipient wallets per run exercise key derivation and
    // signing for real, rather than replaying hardcoded keys.
    const devWallet = createRandomWallet();
    const devAddress = devWallet.getAddress();
    recipientAddress = createRandomWallet().getAddress();

    closeIndexer = initIndexer();
    await fundAccount(devAddress, SCENARIO_FUNDING_ICX);

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
    const fundedLoop = convertICXtoLoop(SCENARIO_FUNDING_ICX);
    expect(account.balance.toFixed()).toBe(fundedLoop.toFixed());
    expect(account.spendableBalance.toFixed()).toBe(fundedLoop.toFixed());
    expect(account.operations.length).toBe(0);
    expect(account.iconResources.totalDelegated.toString()).toBe("0");
    expect(account.iconResources.votingPower.toString()).toBe("0");
    expect((await getStepPrice(account)).toFixed()).toBe(STEP_PRICE.toFixed());
  },

  afterAll: async account => {
    expect(account.operations.length).toBe(3);
    expect(account.operations.every(op => op.type === "OUT")).toBe(true);
    expect(account.balance.lt(convertICXtoLoop(0.2))).toBe(true);

    if (!sodaxAccountBridge) throw new Error("accountBridge missing in afterAll");
    const recipientAccount = makeIconAccount(recipientAddress);
    const recipient = await firstValueFrom(
      sodaxAccountBridge
        .sync(recipientAccount, { paginationConfig: {} })
        .pipe(reduce((acc, f) => f(acc), recipientAccount)),
    );
    expect(recipient.operations.length).toBe(3);
    expect(recipient.operations.every(op => op.type === "IN")).toBe(true);
    expect(recipient.balance.toFixed()).toBe(totalSentLoop.toFixed());
  },

  teardown: async () => {
    closeIndexer?.();
  },
};
