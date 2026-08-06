import type { Scenario } from "@ledgerhq/coin-tester/main";
import type { Transaction, HederaAccount } from "@ledgerhq/coin-hedera/types";
import type { TokenAccount } from "@ledgerhq/types-live";
import type { TokenCurrency } from "@ledgerhq/ledger-wallet-framework/types";
import { TOKEN_SYMBOL, TOKEN_UNIT, makeHederaAccount, makeLocalErc20Token } from "../fixtures";
import {
  type HederaScenarioTransaction,
  SCENARIO_RETRY_POLICY,
  findTokenSubAccount,
  setupHederaScenario,
} from "../helpers";
import {
  deployErc20Token,
  transferErc20,
  waitForErc20Balance,
  waitForMirrorNodeEvmAddress,
} from "../genesis";
import { registerErc20Token, resetErc20Tokens, refresh } from "../hgraphFake";

const RECEIVE_AMOUNT = 42 * TOKEN_UNIT;

let closeMswHandlers: (() => void) | undefined;
let token: TokenCurrency;
let tokenEvmAddress: string;
let accountEvmAddress: string;
let scenarioStartedAt: Date;

function findErc20SubAccount(account: HederaAccount): TokenAccount | undefined {
  return findTokenSubAccount(account, token.id);
}

export const scenarioHederaErc20Receive: Scenario<Transaction, HederaAccount> = {
  name: "Ledger Live Hedera — ERC20 received from a 3rd party",

  setup: async () => {
    resetErc20Tokens();
    scenarioStartedAt = new Date();

    const { contractId, evmAddress } = await deployErc20Token();
    tokenEvmAddress = evmAddress;
    registerErc20Token(contractId, evmAddress);

    token = makeLocalErc20Token(evmAddress);

    // No seeding: the whole point is that the account starts with a zero balance for this token.
    const { currencyBridge, accountBridge, publicKey, accountId, close } =
      await setupHederaScenario([token]);
    closeMswHandlers = close;

    accountEvmAddress = await waitForMirrorNodeEvmAddress(accountId);

    // refresh() must run once here, or getErcTokenTransferRows throws on a null snapshot. After
    // this the feed stays frozen and empty for our account, which is what this scenario tests.
    await refresh();

    return {
      currencyBridge,
      accountBridge,
      account: makeHederaAccount(accountId, publicKey),
      // retryLimit must stay well under MAX_TRANSFER_PAGES: transferPageCount only resets on a
      // successful refresh(), and each sync issues one page request.
      ...SCENARIO_RETRY_POLICY,
    };
  },

  // No beforeSync here: refreshing after setup would populate the transfer feed that this
  // scenario needs to stay empty.

  beforeAll: account => {
    expect(
      account.subAccounts?.some(sa => sa.type === "TokenAccount" && sa.token.id === token.id),
    ).toBe(false);
  },

  getTransactions: () => [],

  getInternalTransactions: async (): Promise<HederaScenarioTransaction[]> => {
    // Awaited by the runner before the (empty) regular-transaction loop. No refresh() follows,
    // so the balance moves live while the transfer feed stays empty.
    await transferErc20(tokenEvmAddress, accountEvmAddress, RECEIVE_AMOUNT);
    await waitForErc20Balance(tokenEvmAddress, accountEvmAddress, RECEIVE_AMOUNT);

    return [
      {
        name: `Receive ${RECEIVE_AMOUNT / TOKEN_UNIT} ${TOKEN_SYMBOL} (ERC20) from a 3rd party`,
        family: "hedera",
        expect: (previous, current) => {
          const sub = findErc20SubAccount(current);
          expect(sub).toBeDefined();
          if (!sub) return; // retryable: mirror-node lag, not a TypeError

          expect(sub.balance.toString()).toBe(String(RECEIVE_AMOUNT));
          // The branch under test builds the sub-account from balance alone, so it carries no
          // operations.
          expect(sub.operations).toHaveLength(0);
          expect(sub.operationsCount).toBe(0);
          // creationDate is `new Date()` on this branch, so only the scenario window can be
          // asserted.
          expect(sub.creationDate.getTime()).toBeGreaterThanOrEqual(scenarioStartedAt.getTime());
        },
      },
    ];
  },

  teardown: () => {
    closeMswHandlers?.();
    resetErc20Tokens();
  },
};
