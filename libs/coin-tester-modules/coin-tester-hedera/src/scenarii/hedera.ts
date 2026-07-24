import { PrivateKey } from "@hashgraph/sdk";
import type { Scenario } from "@ledgerhq/coin-tester/main";
import type { Transaction, HederaAccount, HederaOperationExtra } from "@ledgerhq/coin-hedera/types";
import { HEDERA_TRANSACTION_MODES } from "@ledgerhq/coin-hedera/constants";
import BigNumber from "bignumber.js";
import { RECIPIENT, makeHederaAccount } from "../fixtures";
import { type HederaScenarioTransaction, setupHederaScenario } from "../helpers";
import { getHgraphObserver } from "../indexer";

const ONE_HBAR_IN_TINYBAR = 100_000_000;

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
      // Assert, don't destructure: an empty list from mirror-node lag stays retryable.
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
      expect(memoExtra.memo).toBeDefined();            // fail => "Solo returned no memo"
      expect(memoExtra.memo).toBe("ledger-live e2e");  // fail => "memo came back, but wrong"
    },
  };

  const sendToAutoCreatedAccount: HederaScenarioTransaction = {
    name: "Send 1 HBAR to a fresh alias (auto-creates the recipient account)",
    family: "hedera",
    mode: HEDERA_TRANSACTION_MODES.Send,
    amount: new BigNumber(ONE_HBAR_IN_TINYBAR),
    recipient: AUTO_CREATE_ALIAS,
    expect: (previous, current) => {
      expect(current.operations.length).toBeGreaterThan(previous.operations.length);
      const [latest] = current.operations;
      expect(latest.type).toBe("OUT");
      // A resolved numeric recipient (0.0.N, never the alias hex) proves the alias auto-created.
      expect(latest.recipients.some(r => /^0\.0\.\d+$/.test(r))).toBe(true);
      expect(current.balance).toStrictEqual(previous.balance.minus(latest.value));
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
      // Absorbs the mirror node's lag behind consensus — for `expect` only, nothing earlier.
      retryInterval: 2000,
      retryLimit: 20,
    };
  },

  getTransactions: () => makeTransactions(),

  afterAll: () => {
    const observer = getHgraphObserver();
    console.warn(
      `hgraph observer: ${observer.callCount} call(s) — ${observer.queries.join(" | ")}`,
    );
  },

  // Cluster teardown lives in scenarii.test.ts's afterAll — no scenario may tear it down.
  teardown: () => {
    closeMswHandlers?.();
  },
};
