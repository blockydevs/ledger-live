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
// survive one SEND_AMOUNT send without hitting 0.
const SEED_AMOUNT = 100 * UNIT;
const SEND_AMOUNT = 10 * UNIT;

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

  return [sendErc20];
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
