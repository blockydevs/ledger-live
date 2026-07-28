import type { Scenario } from "@ledgerhq/coin-tester/main";
import type { Transaction, HederaAccount } from "@ledgerhq/coin-hedera/types";
import { HEDERA_TRANSACTION_MODES } from "@ledgerhq/coin-hedera/constants";
import BigNumber from "bignumber.js";
import { makeHederaAccount } from "../fixtures";
import {
  type HederaScenarioTransaction,
  SCENARIO_RETRY_POLICY,
  setupHederaScenario,
} from "../helpers";
import { getFirstNodeId } from "../genesis";

let closeMswHandlers: (() => void) | undefined;
let accountId: string;
let stakingNodeId: number;

function makeTransactions(): HederaScenarioTransaction[] {
  const delegate: HederaScenarioTransaction = {
    name: `Delegate to node ${stakingNodeId}`,
    family: "hedera",
    mode: HEDERA_TRANSACTION_MODES.Delegate,
    properties: { stakingNodeId },
    amount: new BigNumber(0),
    recipient: accountId,
    expect: (previous, current) => {
      expect(current.operations.length).toBeGreaterThan(previous.operations.length);
      const [latest] = current.operations;
      expect(latest.type).toBe("DELEGATE");
      expect(current.hederaResources?.delegation?.nodeId).toBe(stakingNodeId);
    },
  };

  const undelegate: HederaScenarioTransaction = {
    name: "Undelegate",
    family: "hedera",
    mode: HEDERA_TRANSACTION_MODES.Undelegate,
    properties: { stakingNodeId: null },
    amount: new BigNumber(0),
    recipient: accountId,
    expect: (previous, current) => {
      expect(current.operations.length).toBeGreaterThan(previous.operations.length);
      const [latest] = current.operations;
      expect(latest.type).toBe("UNDELEGATE");
      // `null`, not a delegation object with nodeId === -1: Solo's mirror node doesn't send that
      // sentinel. Non-vacuous only because `delegate` ran immediately before this in the scenario.
      expect(current.hederaResources?.delegation).toBeNull();
    },
  };

  return [delegate, undelegate];
}

export const scenarioHederaStaking: Scenario<Transaction, HederaAccount> = {
  name: "Ledger Live Hedera — delegate and undelegate",

  setup: async () => {
    const {
      currencyBridge,
      accountBridge,
      publicKey,
      accountId: newAccountId,
      close,
    } = await setupHederaScenario([]);
    closeMswHandlers = close;
    accountId = newAccountId;
    stakingNodeId = await getFirstNodeId();

    return {
      currencyBridge,
      accountBridge,
      account: makeHederaAccount(accountId, publicKey),
      ...SCENARIO_RETRY_POLICY,
    };
  },

  getTransactions: () => makeTransactions(),

  teardown: () => {
    closeMswHandlers?.();
  },
};
