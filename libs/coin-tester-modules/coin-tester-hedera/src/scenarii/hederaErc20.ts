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
// A zero-balance ERC20 sub-account with no operations gets dropped by the bridge, so the seed
// must not hit zero on the first send (send-max, later, drains it once it has operations).
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

      // previous must already carry the genesis seed as an IN operation: it's an incoming ERC20
      // transfer, and the opening beforeSync refreshed the snapshot before the first sync.
      const seedIn = previousSub.operations.find(op => op.type === "IN");
      expect(seedIn).toBeDefined();
      if (!seedIn) return;
      expect(seedIn.value.toString()).toBe(String(SEED_AMOUNT));

      expect(currentSub.balance.toString()).toBe(previousSub.balance.minus(SEND_AMOUNT).toString());

      const [latestSub] = currentSub.operations;
      expect(latestSub).toBeDefined();
      if (!latestSub) return;
      expect(latestSub.type).toBe("OUT");
      expect(latestSub.value.toString()).toBe(String(SEND_AMOUNT));

      // A FEES operation on the parent account with the same hash proves both the ERC20 branch
      // and that CAL resolution worked: resolveBridgeOperations only keeps FEES when the token
      // operation resolved through CAL.
      const feesOpHashes = current.operations.filter(op => op.type === "FEES").map(op => op.hash);
      expect(feesOpHashes).toContain(latestSub.hash);

      // extra.gasLimit is the on-chain gas limit from the mirror node, proof the estimate survived
      // crafting/signing/broadcast. No upper bound asserted: Solo's intrinsic-cost overhead on top
      // of the ~60k estimate is unmeasured.
      const { gasLimit } = latestSub.extra as HederaOperationExtra;
      // A bare `expect(undefined).toBeGreaterThan(0)` would escape the runner's retry wrapper
      // and kill the scenario outright.
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

      // Absolute, not a delta off `previous`: `previous` is frozen at this transaction's opening
      // sync and never re-read on retry, so a lagging snapshot there would fail forever.
      expect(currentSub.balance.toString()).toBe(
        String(SEED_AMOUNT - SEND_AMOUNT - MEMO_SEND_AMOUNT),
      );

      const [latestSub] = currentSub.operations;
      expect(latestSub).toBeDefined();
      if (!latestSub) return;
      expect(latestSub.type).toBe("OUT");
      expect(latestSub.value.toString()).toBe(String(MEMO_SEND_AMOUNT));

      // The memo survives craft (.setTransactionMemo) and comes back via memo_base64 on the
      // mirror transaction, landing in extra.
      const { memo } = latestSub.extra as HederaOperationExtra;
      expect(memo).toBe(MEMO);
    },
  };

  const sendErc20Max: HederaScenarioTransaction = {
    name: `Send max ${TOKEN_SYMBOL} (ERC20)`,
    family: "hedera",
    mode: HEDERA_TRANSACTION_MODES.Send,
    subAccountId: encodeTokenAccountId(makeHederaAccount(accountId, "").id, token),
    // amount is what calculateAmount should arrive at; prepareTransaction overwrites it with the
    // real sub-account balance.
    amount: new BigNumber(SEND_MAX_AMOUNT),
    useAllAmount: true,
    recipient: recipientId,
    expect: (previous, current) => {
      const currentSub = findErc20SubAccount(current);
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

    const accountEvmAddress = await waitForMirrorNodeEvmAddress(accountId);

    // Fund the account under test directly from the genesis operator, bypassing the bridge.
    await transferErc20(evmAddress, accountEvmAddress, SEED_AMOUNT);

    // The seed must be confirmed as a balance, not a transfer: the transfer feed is derived from
    // the balance map and stays empty until a balance row exists.
    await waitForErc20Balance(evmAddress, accountEvmAddress, SEED_AMOUNT);

    // The recipient must be a freshly created funded account, not the RECIPIENT constant: the
    // ERC20 path calls toEVMAddress on the recipient under an invariant, and only
    // createFundedAccount guarantees the mirror node has evm_address populated for it.
    recipientId = await createFundedAccount(
      PrivateKey.generateED25519().publicKey.toStringRaw(),
      1,
    );

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
