import type { Scenario } from "@ledgerhq/coin-tester/main";
import type { Transaction, HederaAccount } from "@ledgerhq/coin-hedera/types";
import type { TokenAccount } from "@ledgerhq/types-live";
import type { TokenCurrency } from "@ledgerhq/types-cryptoassets";
import { TOKEN_DECIMALS, TOKEN_SYMBOL, makeHederaAccount, makeLocalErc20Token } from "../fixtures";
import { type HederaScenarioTransaction, setupHederaScenario } from "../helpers";
import {
  deployErc20Token,
  transferErc20,
  waitForErc20Balance,
  waitForMirrorNodeEvmAddress,
} from "../genesis";
import { registerErc20Token, resetErc20Tokens, refresh } from "../hgraphFake";

const UNIT = 10 ** TOKEN_DECIMALS;
const RECEIVE_AMOUNT = 42 * UNIT;

let closeMswHandlers: (() => void) | undefined;
let token: TokenCurrency;
let tokenEvmAddress: string;
let accountEvmAddress: string;
let scenarioStartedAt: Date;

function findErc20SubAccount(account: HederaAccount): TokenAccount | undefined {
  return account.subAccounts?.find(sa => sa.type === "TokenAccount" && sa.token.id === token.id) as
    | TokenAccount
    | undefined;
}

export const scenarioHederaErc20Receive: Scenario<Transaction, HederaAccount> = {
  name: "Ledger Live Hedera — ERC20 received from a 3rd party",

  setup: async () => {
    // Defensive, same as the send scenario: makes setup self-contained instead of dependent on a
    // predecessor's teardown having run.
    resetErc20Tokens();
    scenarioStartedAt = new Date();

    const { contractId, evmAddress } = await deployErc20Token();
    tokenEvmAddress = evmAddress;
    registerErc20Token(contractId, evmAddress);

    token = makeLocalErc20Token(evmAddress);

    // No seeding: the whole point is that the account starts with a zero balance for this token.
    const {
      currencyBridge,
      accountBridge,
      publicKey,
      accountId,
      close,
    } = await setupHederaScenario([token]);
    closeMswHandlers = close;

    accountEvmAddress = await waitForMirrorNodeEvmAddress(accountId);

    // The ONLY refresh() this scenario ever performs, and it is not about seeing any transfer: a
    // null snapshot makes getErcTokenTransferRows throw HgraphFakeGuardError, which is a
    // programming-error guard and escapes the retry wrapper. After this the feed stays frozen and
    // empty for our account, which is exactly the state the tested branch requires.
    await refresh();

    return {
      currencyBridge,
      accountBridge,
      account: makeHederaAccount(accountId, publicKey),
      retryInterval: 2000,
      // Must stay well under MAX_TRANSFER_PAGES (50, hgraphFake.ts:292): transferPageCount only
      // resets on a successful refresh(), and getERC20Transfers issues one page request per sync.
      retryLimit: 20,
    };
  },

  // Deliberately no beforeSync. Nothing may refresh the transfer snapshot after setup, otherwise
  // the received transfer would show up as an operation and the branch under test would be missed.

  beforeAll: account => {
    // Asserted here rather than as a transaction: an absence assertion gains nothing from retry,
    // and under mirror-node lag a retried version could pass for entirely the wrong reason.
    expect(
      account.subAccounts?.some(sa => sa.type === "TokenAccount" && sa.token.id === token.id),
    ).toBe(false);
  },

  getTransactions: () => [],

  getInternalTransactions: async (): Promise<HederaScenarioTransaction[]> => {
    // Awaited by the runner at main.ts:156, before the (empty) regular-transaction loop. No
    // refresh() follows, so the balance moves live while the transfer feed stays empty.
    await transferErc20(tokenEvmAddress, accountEvmAddress, RECEIVE_AMOUNT);
    await waitForErc20Balance(tokenEvmAddress, accountEvmAddress, RECEIVE_AMOUNT);

    return [
      {
        name: `Receive ${RECEIVE_AMOUNT / UNIT} ${TOKEN_SYMBOL} (ERC20) from a 3rd party`,
        family: "hedera",
        expect: (previous, current) => {
          const sub = findErc20SubAccount(current);
          expect(sub).toBeDefined();
          if (!sub) return; // retryable: mirror-node lag, not a TypeError

          expect(sub.balance.toString()).toBe(String(RECEIVE_AMOUNT));
          // The branch under test (bridge/utils.ts:235-268) builds the sub-account from the
          // balance alone, so it must carry no operations at all.
          expect(sub.operations).toHaveLength(0);
          expect(sub.operationsCount).toBe(0);
          // creationDate is `new Date()` on this branch (utils.ts:265), so the only meaningful
          // assertion is that it was minted during this scenario.
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
