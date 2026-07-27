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
// Fixed partial send, not `useAllAmount`: a send-max here would fail on-chain since the account's
// real spendable balance runs a touch below what the post-send sync reports.
const HBAR_SENT = 50 * ONE_HBAR_IN_TINYBAR;

let closeMswHandlers: (() => void) | undefined;
let token2: TokenCurrency;
let token3: TokenCurrency;
let accountId: string;

function findSub(account: HederaAccount, tokenId: string): TokenAccount | undefined {
  return account.subAccounts?.find(sa => sa.type === "TokenAccount" && sa.token.id === tokenId) as
    | TokenAccount
    | undefined;
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
      // Asserted off the operation, not a previous/current delta: `previous` can lag the real
      // balance right after a send.
      expect(latest.value.minus(latest.fee).toString()).toBe(String(HBAR_SENT));
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
    // Created first so both tokens are known when the crypto-assets store is installed.
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

    // Auto-association means a treasury transfer associates on receipt; wait for indexing.
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
