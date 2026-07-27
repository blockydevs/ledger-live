import { PrivateKey } from "@hashgraph/sdk";
import type { Scenario } from "@ledgerhq/coin-tester/main";
import type { Transaction, HederaAccount, HederaOperationExtra } from "@ledgerhq/coin-hedera/types";
import { HEDERA_TRANSACTION_MODES, DEFAULT_GAS_LIMIT } from "@ledgerhq/coin-hedera/constants";
import type { TokenAccount } from "@ledgerhq/types-live";
import type { TokenCurrency } from "@ledgerhq/types-cryptoassets";
import { encodeTokenAccountId } from "@ledgerhq/ledger-wallet-framework/account";
import BigNumber from "bignumber.js";
import { TOKEN_DECIMALS, TOKEN_SYMBOL, makeHederaAccount, makeLocalErc20Token } from "../fixtures";
import { type HederaScenarioTransaction, setupHederaScenario } from "../helpers";
import {
  createFundedAccount,
  deployErc20Token,
  transferErc20,
  waitForErc20Balance,
  waitForMirrorNodeEvmAddress,
} from "../genesis";
import { registerErc20Token, resetErc20Tokens, refresh } from "../hgraphFake";

const UNIT = 10 ** TOKEN_DECIMALS;
// bridge/utils.ts:254 drops a zero-balance, no-operations ERC20 sub-account, so the seed must
// survive the first send without hitting 0. The send-max transaction below drains it to zero on
// purpose — by then the sub-account has operations, so it stays visible.
const SEED_AMOUNT = 100 * UNIT;
const SEND_AMOUNT = 10 * UNIT;
const MEMO_SEND_AMOUNT = 5 * UNIT;
/** What is left after the two fixed sends; send-max must drain exactly this. */
const SEND_MAX_AMOUNT = SEED_AMOUNT - SEND_AMOUNT - MEMO_SEND_AMOUNT;
const MEMO = "ledger-live coin-tester erc20 memo";

let closeMswHandlers: (() => void) | undefined;
let token: TokenCurrency;
let evmAddress: string;
let accountId: string;
let recipientId: string;

function findErc20SubAccount(account: HederaAccount): TokenAccount | undefined {
  return account.subAccounts?.find(sa => sa.type === "TokenAccount" && sa.token.id === token.id) as
    | TokenAccount
    | undefined;
}

function makeTransactions(): HederaScenarioTransaction[] {
  const sendErc20: HederaScenarioTransaction = {
    name: `Send ${SEND_AMOUNT / UNIT} ${TOKEN_SYMBOL} (ERC20)`,
    family: "hedera",
    mode: HEDERA_TRANSACTION_MODES.Send,
    subAccountId: encodeTokenAccountId(makeHederaAccount(accountId, "").id, token),
    amount: new BigNumber(SEND_AMOUNT),
    recipient: recipientId,
    expect: (previous, current) => {
      const previousSub = findErc20SubAccount(previous);
      const currentSub = findErc20SubAccount(current);
      expect(previousSub).toBeDefined();
      expect(currentSub).toBeDefined();
      if (!previousSub || !currentSub) return; // retryable: mirror-node/hgraph-fake lag, not a TypeError

      // The genesis seed is an incoming ERC20 transfer, and the opening beforeSync refreshed the
      // snapshot before the first sync, so `previous` must already carry it as an IN operation.
      // Free coverage of the IN branch — no extra transaction, no extra wall-clock.
      const seedIn = previousSub.operations.find(op => op.type === "IN");
      expect(seedIn).toBeDefined();
      if (!seedIn) return;
      expect(seedIn.value.toString()).toBe(String(SEED_AMOUNT));

      expect(currentSub.balance.toString()).toBe(
        previousSub.balance.minus(SEND_AMOUNT).toString(),
      );

      const [latestSub] = currentSub.operations;
      expect(latestSub).toBeDefined();
      if (!latestSub) return;
      expect(latestSub.type).toBe("OUT");
      expect(latestSub.value.toString()).toBe(String(SEND_AMOUNT));

      // A FEES operation on the parent account with the same hash proves both that we're on the
      // ERC20 branch and that CAL resolution worked: resolveBridgeOperations only keeps FEES when
      // the token operation resolved through CAL.
      const feesOpHashes = current.operations.filter(op => op.type === "FEES").map(op => op.hash);
      expect(feesOpHashes).toContain(latestSub.hash);

      // extra.gasLimit is the on-chain gas limit from the mirror node, proof the estimate survived
      // crafting/signing/broadcast. No upper bound asserted: Solo's real intrinsic-cost overhead on
      // top of the ~60k estimate is unmeasured.
      const { gasLimit } = latestSub.extra as HederaOperationExtra;
      // Bare `expect(undefined).toBeGreaterThan(0)` throws a matcher error with no matcherResult,
      // which escapes the runner's retry wrapper and kills the scenario outright.
      expect(typeof gasLimit).toBe("number");
      if (typeof gasLimit !== "number") return;
      expect(gasLimit).not.toBe(DEFAULT_GAS_LIMIT.toNumber());
      expect(gasLimit).toBeGreaterThan(0);
    },
  };

  const sendErc20WithMemo: HederaScenarioTransaction = {
    name: `Send ${MEMO_SEND_AMOUNT / UNIT} ${TOKEN_SYMBOL} (ERC20) with a memo`,
    family: "hedera",
    mode: HEDERA_TRANSACTION_MODES.Send,
    subAccountId: encodeTokenAccountId(makeHederaAccount(accountId, "").id, token),
    amount: new BigNumber(MEMO_SEND_AMOUNT),
    recipient: recipientId,
    memo: MEMO,
    expect: (previous, current) => {
      const currentSub = findErc20SubAccount(current);
      expect(currentSub).toBeDefined();
      if (!currentSub) return;

      // Absolute, not a delta off `previous`: `previous` is frozen at the opening sync of this
      // transaction and never re-read on retry, so a lagging snapshot there would fail forever.
      expect(currentSub.balance.toString()).toBe(String(SEED_AMOUNT - SEND_AMOUNT - MEMO_SEND_AMOUNT));

      const [latestSub] = currentSub.operations;
      expect(latestSub).toBeDefined();
      if (!latestSub) return;
      expect(latestSub.type).toBe("OUT");
      expect(latestSub.value.toString()).toBe(String(MEMO_SEND_AMOUNT));

      // The memo survives craft (.setTransactionMemo, craftTransaction.ts:145) and comes back
      // through memo_base64 on the mirror transaction (listOperations.v2.ts:44,51), landing in
      // extra. Asserting the value, not merely that validation let it through.
      const { memo } = latestSub.extra as HederaOperationExtra;
      expect(memo).toBe(MEMO);
    },
  };

  const sendErc20Max: HederaScenarioTransaction = {
    name: `Send max ${TOKEN_SYMBOL} (ERC20)`,
    family: "hedera",
    mode: HEDERA_TRANSACTION_MODES.Send,
    subAccountId: encodeTokenAccountId(makeHederaAccount(accountId, "").id, token),
    // `amount` is the value we expect calculateAmount to arrive at; prepareTransaction overwrites
    // it with the real sub-account balance anyway. Stated explicitly so a drift between the
    // scenario's arithmetic and the chain shows up as a status error rather than a silent pass.
    amount: new BigNumber(SEND_MAX_AMOUNT),
    useAllAmount: true,
    recipient: recipientId,
    expect: (previous, current) => {
      const currentSub = findErc20SubAccount(current);
      // Not knife-edge, unlike an HBAR send-max: calculateTokenAmount returns
      // `totalSpent: amount` with no fee added (bridge/utils.ts:51-67), and estimateMaxSpendable
      // returns the bare token balance for a token account (estimateMaxSpendable.ts:17-19). The
      // fee is paid in HBAR from the parent account.
      //
      // The drained sub-account must STAY visible: operationsByToken (bridge/utils.ts:197) builds
      // it from operations regardless of balance — `if (!balance) continue` does not fire for
      // BigNumber(0), which is a truthy object — and the zero-balance drop at utils.ts:254 only
      // guards the second loop, over tokens with no operations. Easy to assume the opposite.
      expect(currentSub).toBeDefined();
      if (!currentSub) return;
      expect(currentSub.balance.toString()).toBe("0");

      const [latestSub] = currentSub.operations;
      expect(latestSub).toBeDefined();
      if (!latestSub) return;
      expect(latestSub.type).toBe("OUT");
      expect(latestSub.value.toString()).toBe(String(SEND_MAX_AMOUNT));
    },
  };

  return [sendErc20, sendErc20WithMemo, sendErc20Max];
}

export const scenarioHederaErc20: Scenario<Transaction, HederaAccount> = {
  name: "Ledger Live Hedera — ERC20 transfer",

  setup: async () => {
    // Defensive: teardown() already clears the registry, but resetting here too makes setup()
    // self-contained rather than depending on its predecessor's cleanup having run.
    resetErc20Tokens();

    // The token must be registered right after deploy: the hgraph-fake registry reset isn't wired
    // into initMswHandlers.
    const { contractId, evmAddress: deployedEvmAddress } = await deployErc20Token();
    evmAddress = deployedEvmAddress;
    registerErc20Token(contractId, evmAddress);

    token = makeLocalErc20Token(evmAddress);

    const {
      currencyBridge,
      accountBridge,
      publicKey,
      accountId: newAccountId,
      close,
    } = await setupHederaScenario([token]);
    closeMswHandlers = close;
    accountId = newAccountId;

    // Re-fetch evm_address (already awaited inside setupHederaScenario) to use for raw ERC20 seeding.
    const accountEvmAddress = await waitForMirrorNodeEvmAddress(accountId);

    // Fixture seeding: fund the account under test directly from the genesis operator, bypassing
    // the bridge entirely.
    await transferErc20(evmAddress, accountEvmAddress, SEED_AMOUNT);

    // The seed must be confirmed as a balance, not a transfer: the transfer feed is derived from
    // the balance map and stays empty until a balance row exists.
    await waitForErc20Balance(evmAddress, accountEvmAddress, SEED_AMOUNT);

    // The recipient of the Send transaction must be a freshly created funded account, not the
    // RECIPIENT constant: the ERC20 path calls toEVMAddress on the recipient under an invariant,
    // and only createFundedAccount guarantees the mirror node has evm_address populated for it.
    recipientId = await createFundedAccount(PrivateKey.generateED25519().publicKey.toStringRaw(), 1);

    return {
      currencyBridge,
      accountBridge,
      account: makeHederaAccount(accountId, publicKey),
      retryInterval: 2000,
      retryLimit: 20,
    };
  },

  beforeSync: async () => {
    await refresh();
  },

  getTransactions: () => makeTransactions(),

  teardown: () => {
    closeMswHandlers?.();
    resetErc20Tokens();
  },
};
