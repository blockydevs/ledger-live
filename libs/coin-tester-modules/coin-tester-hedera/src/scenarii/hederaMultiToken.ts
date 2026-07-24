import type { Scenario } from "@ledgerhq/coin-tester/main";
import type { Transaction, HederaAccount } from "@ledgerhq/coin-hedera/types";
import { HEDERA_TRANSACTION_MODES } from "@ledgerhq/coin-hedera/constants";
import type { TokenAccount } from "@ledgerhq/types-live";
import type { TokenCurrency } from "@ledgerhq/types-cryptoassets";
import BigNumber from "bignumber.js";
import { TOKEN_DECIMALS, RECIPIENT, makeHederaAccount, makeLocalHtsToken } from "../fixtures";
import { type HederaScenarioTransaction, setupHederaScenario } from "../helpers";
import { createHtsToken, transferToken, waitForMirrorNodeTokenBalance } from "../genesis";

const ONE_HBAR_IN_TINYBAR = 100_000_000;

const UNIT = 10 ** TOKEN_DECIMALS;
const TOKEN_INITIAL_SUPPLY = 1_000 * UNIT;
const TOKEN2_INJECTED = 50 * UNIT;
const TOKEN3_INJECTED = 70 * UNIT;
const MAX_AUTO_ASSOCIATIONS = 10; // >= the 2 tokens; NOT the -1 sentinel
// A fixed partial send, deliberately NOT `useAllAmount`. A native send-max here fails on-chain with
// INSUFFICIENT_ACCOUNT_BALANCE: `useAllAmount` computes amount = syncedBalance − estimatedFee, but
// the account's real spendable balance is a touch lower than the balance the sync reports right
// after the preceding send, so amount + actual fee exceeds it and the whole transfer is rejected
// (only the fee is charged). A fixed amount well under balance can't hit that edge, and still proves
// the property under test: a native HBAR movement leaves the token sub-accounts untouched. The pure
// send-max drain is already covered by scenarii/hedera.ts.
const HBAR_SENT = 50 * ONE_HBAR_IN_TINYBAR;

let closeMswHandlers: (() => void) | undefined;
let token2: TokenCurrency;
let token3: TokenCurrency;
let accountId: string;

function findSub(account: HederaAccount, tokenId: string): TokenAccount | undefined {
  return account.subAccounts?.find(
    sa => sa.type === "TokenAccount" && sa.token.id === tokenId,
  ) as TokenAccount | undefined;
}

function makeTransactions(): HederaScenarioTransaction[] {
  const assertTokensPresent: HederaScenarioTransaction = {
    name: "Both LLT2 and LLT3 sub-accounts resolve with their injected balances",
    family: "hedera",
    mode: HEDERA_TRANSACTION_MODES.Send,
    amount: new BigNumber(ONE_HBAR_IN_TINYBAR),
    recipient: RECIPIENT,
    expect: (previous, current) => {
      const sub2 = findSub(current, token2.id);
      const sub3 = findSub(current, token3.id);
      expect(sub2).toBeDefined();
      expect(sub3).toBeDefined();
      if (!sub2 || !sub3) return; // retryable: mirror-node lag, not a TypeError
      expect(sub2.balance.toString()).toBe(String(TOKEN2_INJECTED));
      expect(sub3.balance.toString()).toBe(String(TOKEN3_INJECTED));
    },
  };

  const sendHbarPreservingTokens: HederaScenarioTransaction = {
    name: "Send HBAR preserves both token sub-accounts",
    family: "hedera",
    mode: HEDERA_TRANSACTION_MODES.Send,
    amount: new BigNumber(HBAR_SENT),
    recipient: RECIPIENT,
    expect: (previous, current) => {
      expect(current.operations.length).toBeGreaterThan(previous.operations.length);
      const [latest] = current.operations;
      expect(latest.type).toBe("OUT");
      expect(latest.recipients).toContain(RECIPIENT);
      // The send moved exactly HBAR_SENT. `value` is the fee-inclusive net change (amount + fee),
      // so `value − fee === amount`. Asserted off the operation itself rather than as a
      // `current === previous − value` balance delta: the sync that produces `previous` right after
      // the preceding send can lag the real balance (that lag is what breaks a naive send-max), and
      // this scenario's point is token preservation, not native-HBAR balance accounting (which
      // scenarii/hedera.ts already checks rigorously).
      expect(latest.value.minus(latest.fee).toString()).toBe(String(HBAR_SENT));
      // both token sub-accounts preserved — equality to the pre-send (previous) balance, never > 0,
      // so any change to a token balance during the native send fails the test.
      expect(findSub(current, token2.id)?.balance.toString()).toBe(
        findSub(previous, token2.id)?.balance.toString(),
      );
      expect(findSub(current, token3.id)?.balance.toString()).toBe(
        findSub(previous, token3.id)?.balance.toString(),
      );
    },
  };

  return [assertTokensPresent, sendHbarPreservingTokens];
}

export const scenarioHederaMultiToken: Scenario<Transaction, HederaAccount> = {
  name: "Ledger Live Hedera — multiple HTS tokens via auto-association",

  setup: async () => {
    // Created before `setupHederaScenario` so both tokens are known when the crypto-assets store
    // is installed — installing the store is unskippable and takes the token list as a required
    // argument.
    const tokenId2 = await createHtsToken({
      decimals: TOKEN_DECIMALS,
      symbol: "LLT2",
      initialSupply: TOKEN_INITIAL_SUPPLY,
    });
    const tokenId3 = await createHtsToken({
      decimals: TOKEN_DECIMALS,
      symbol: "LLT3",
      initialSupply: TOKEN_INITIAL_SUPPLY,
    });
    token2 = makeLocalHtsToken(tokenId2);
    token3 = makeLocalHtsToken(tokenId3);

    const {
      currencyBridge,
      accountBridge,
      publicKey,
      accountId: newAccountId,
      close,
    } = await setupHederaScenario([token2, token3], MAX_AUTO_ASSOCIATIONS);
    closeMswHandlers = close;
    accountId = newAccountId;

    // The account was created with auto-association, so a treasury transfer auto-associates on
    // receipt — no account key, no bridge tx needed. Wait for indexing so the first sync sees the
    // balances.
    await transferToken(tokenId2, accountId, TOKEN2_INJECTED);
    await transferToken(tokenId3, accountId, TOKEN3_INJECTED);
    await waitForMirrorNodeTokenBalance(accountId, tokenId2, TOKEN2_INJECTED);
    await waitForMirrorNodeTokenBalance(accountId, tokenId3, TOKEN3_INJECTED);

    return {
      currencyBridge,
      accountBridge,
      account: makeHederaAccount(accountId, publicKey),
      retryInterval: 2000,
      retryLimit: 20,
    };
  },

  getTransactions: () => makeTransactions(),

  teardown: () => {
    closeMswHandlers?.();
  },
};
