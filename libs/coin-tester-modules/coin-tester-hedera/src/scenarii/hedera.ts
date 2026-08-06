import { PrivateKey } from "@hashgraph/sdk";
import type { Scenario } from "@ledgerhq/coin-tester/main";
import type { Transaction, HederaAccount, HederaOperationExtra } from "@ledgerhq/coin-hedera/types";
import { HEDERA_TRANSACTION_MODES } from "@ledgerhq/coin-hedera/constants";
import BigNumber from "bignumber.js";
import { ONE_HBAR_IN_TINYBAR, RECIPIENT, makeHederaAccount } from "../fixtures";
import {
  type HederaScenarioTransaction,
  SCENARIO_RETRY_POLICY,
  setupHederaScenario,
} from "../helpers";
import { getHgraphObserver } from "../indexer";

/** A never-funded ED25519 alias; sending HBAR to it exercises Hedera's auto-account-creation. */
const AUTO_CREATE_ALIAS = PrivateKey.generateED25519().publicKey.toAccountId(0, 0).toString();

let closeMswHandlers: (() => void) | undefined;

function makeTransactions(): HederaScenarioTransaction[] {
  const sendOneHbar: HederaScenarioTransaction = {
    name: "Send 1 HBAR to an existing recipient",
    family: "hedera",
    mode: HEDERA_TRANSACTION_MODES.Send,
    amount: new BigNumber(ONE_HBAR_IN_TINYBAR),
    recipient: RECIPIENT,
    expect: (previous, current) => {
      expect(current.operations.length).toBeGreaterThan(0);
      const [latest] = current.operations;
      expect(latest.type).toBe("OUT");
      expect(latest.recipients).toContain(RECIPIENT);
      // `value` is fee-inclusive; subtracting `fee` too would double-count it.
      expect(current.balance).toStrictEqual(previous.balance.minus(latest.value));
    },
  };

  const sendOneHbarWithMemo: HederaScenarioTransaction = {
    name: "Send 1 HBAR with a memo to an existing recipient",
    family: "hedera",
    mode: HEDERA_TRANSACTION_MODES.Send,
    amount: new BigNumber(ONE_HBAR_IN_TINYBAR),
    recipient: RECIPIENT,
    memo: "ledger-live e2e",
    expect: (previous, current) => {
      expect(current.operations.length).toBeGreaterThan(0);
      const [latest] = current.operations;
      expect(latest.type).toBe("OUT");
      expect(latest.recipients).toContain(RECIPIENT);
      expect(current.balance).toStrictEqual(previous.balance.minus(latest.value));
      const memoExtra = latest.extra as HederaOperationExtra;
      expect(memoExtra.memo).toBeDefined();
      expect(memoExtra.memo).toBe("ledger-live e2e");
    },
  };

  const sendToAutoCreatedAccount: HederaScenarioTransaction = {
    name: "Send 1 HBAR to a fresh alias (auto-creates the recipient account)",
    family: "hedera",
    mode: HEDERA_TRANSACTION_MODES.Send,
    amount: new BigNumber(ONE_HBAR_IN_TINYBAR),
    recipient: AUTO_CREATE_ALIAS,
    expect: (previous, current) => {
      // Auto-creation bills the sender through two mirror-node transactions (CRYPTOTRANSFER +
      // CRYPTOCREATEACCOUNT), both as OUT operations.
      const previousIds = new Set(previous.operations.map(op => op.id));
      const created = current.operations.filter(op => !previousIds.has(op.id));
      expect(created.length).toBe(2);
      const transfer = created.find(op => op.value.minus(op.fee).isEqualTo(ONE_HBAR_IN_TINYBAR));
      const accountCreation = created.find(op => op.value.isEqualTo(op.fee));
      expect(transfer).toBeDefined();
      expect(accountCreation).toBeDefined();
      if (!transfer || !accountCreation) return;
      expect(transfer.type).toBe("OUT");
      // A resolved numeric recipient (0.0.N, never the alias hex) proves the alias auto-created.
      expect(transfer.recipients.some(r => /^0\.0\.\d+$/.test(r))).toBe(true);
      expect(accountCreation.type).toBe("OUT");
      expect(accountCreation.value.isGreaterThan(0)).toBe(true);
      expect(current.balance).toStrictEqual(
        previous.balance.minus(transfer.value).minus(accountCreation.value),
      );
    },
  };

  const sendMaxHbar: HederaScenarioTransaction = {
    name: "Send max HBAR (drains the account)",
    family: "hedera",
    mode: HEDERA_TRANSACTION_MODES.Send,
    useAllAmount: true,
    recipient: RECIPIENT,
    expect: (previous, current) => {
      expect(current.operations.length).toBeGreaterThan(previous.operations.length);
      const [latest] = current.operations;
      expect(latest.type).toBe("OUT");
      expect(latest.recipients).toContain(RECIPIENT);
      expect(current.balance).toStrictEqual(previous.balance.minus(latest.value));
      // Send max leaves behind the fee *estimate* minus the actual fee charged — never zero.
      expect(current.balance.toNumber()).toBeLessThanOrEqual(
        latest.fee.multipliedBy(10).toNumber(),
      );
      // Catches an ignored `useAllAmount`: the residual would then be most of the prior balance.
      expect(current.balance.toNumber()).toBeLessThan(previous.balance.toNumber() * 0.01);
    },
  };

  return [sendOneHbar, sendOneHbarWithMemo, sendToAutoCreatedAccount, sendMaxHbar];
}

export const scenarioHedera: Scenario<Transaction, HederaAccount> = {
  name: "Ledger Live Hedera — native HBAR sends",

  setup: async () => {
    const { currencyBridge, accountBridge, publicKey, accountId, close } =
      await setupHederaScenario([]);
    closeMswHandlers = close;

    return {
      currencyBridge,
      accountBridge,
      account: makeHederaAccount(accountId, publicKey),
      ...SCENARIO_RETRY_POLICY,
    };
  },

  getTransactions: () => makeTransactions(),

  afterAll: () => {
    const observer = getHgraphObserver();
    console.warn(
      `hgraph observer: ${observer.callCount} call(s) — ${observer.queries.join(" | ")}`,
    );
  },

  teardown: () => {
    closeMswHandlers?.();
  },
};
