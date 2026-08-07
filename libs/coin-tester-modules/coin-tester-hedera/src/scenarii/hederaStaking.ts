import type { Scenario } from "@ledgerhq/coin-tester/main";
import type { TransactionCommon } from "@ledgerhq/types-live";
import type { HederaAccount } from "@ledgerhq/coin-hedera/types";
import BigNumber from "bignumber.js";
import { makeHederaAccount } from "../fixtures";
import { SCENARIO_RETRY_POLICY } from "../helpers";
import type { HederaBridgeTarget } from "../bridgeTarget";
import type { CanonicalHederaTransaction } from "../canonicalTransaction";
import { getFirstNodeId } from "../genesis";

let closeMswHandlers: (() => void) | undefined;
let accountId: string;
let stakingNodeId: number;

function makeTransactions(
  getStakingNodeId: (account: HederaAccount) => number | null,
): CanonicalHederaTransaction[] {
  const delegate: CanonicalHederaTransaction = {
    name: `Delegate to node ${stakingNodeId}`,
    mode: "delegate",
    stakingNodeId,
    amount: new BigNumber(0),
    recipient: accountId,
    expect: (previous, current) => {
      expect(current.operations.length).toBeGreaterThan(previous.operations.length);
      const [latest] = current.operations;
      expect(latest.type).toBe("DELEGATE");
      expect(getStakingNodeId(current)).toBe(stakingNodeId);
    },
  };

  const undelegate: CanonicalHederaTransaction = {
    name: "Undelegate",
    mode: "undelegate",
    amount: new BigNumber(0),
    recipient: accountId,
    expect: (previous, current) => {
      expect(current.operations.length).toBeGreaterThan(previous.operations.length);
      const [latest] = current.operations;
      expect(latest.type).toBe("UNDELEGATE");
      // Non-vacuous only because `delegate` ran immediately before this in the scenario.
      expect(getStakingNodeId(current)).toBeNull();
    },
  };

  return [delegate, undelegate];
}

export function makeScenarioHederaStaking<T extends TransactionCommon>(
  target: HederaBridgeTarget<T>,
): Scenario<T, HederaAccount> {
  return {
    name: "Ledger Live Hedera — delegate and undelegate",

    setup: async () => {
      const {
        currencyBridge,
        accountBridge,
        publicKey,
        accountId: newAccountId,
        close,
      } = await target.setup([]);
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

    getTransactions: () => makeTransactions(target.getStakingNodeId).map(target.toTransaction),

    teardown: () => {
      closeMswHandlers?.();
    },
  };
}
