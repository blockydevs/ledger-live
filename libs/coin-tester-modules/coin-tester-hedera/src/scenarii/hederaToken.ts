import { PrivateKey } from "@hashgraph/sdk";
import type { Scenario } from "@ledgerhq/coin-tester/main";
import type { TokenAccount, TransactionCommon } from "@ledgerhq/types-live";
import type { HederaAccount } from "@ledgerhq/coin-hedera/types";
import type { TokenCurrency } from "@ledgerhq/ledger-wallet-framework/types";
import { encodeTokenAccountId } from "@ledgerhq/ledger-wallet-framework/account";
import BigNumber from "bignumber.js";
import {
  TOKEN_DECIMALS,
  TOKEN_SYMBOL,
  TOKEN_UNIT,
  makeHederaAccount,
  makeLocalHtsToken,
} from "../fixtures";
import { SCENARIO_RETRY_POLICY, findTokenSubAccount } from "../helpers";
import type { HederaBridgeTarget } from "../bridgeTarget";
import type { CanonicalHederaTransaction } from "../canonicalTransaction";
import {
  associateToken,
  createFundedAccount,
  createHtsToken,
  transferToken,
  waitForMirrorNodeTokenBalance,
} from "../genesis";

const TOKEN_INITIAL_SUPPLY = 1_000 * TOKEN_UNIT;
const TOKEN_INJECTED = 100 * TOKEN_UNIT;
const TOKEN_SENT = 10 * TOKEN_UNIT;

let closeMswHandlers: (() => void) | undefined;
let token: TokenCurrency;
let tokenId: string;
let accountId: string;
let tokenRecipientId: string;
let injected = false;
let beforeEachCallIndex = 0;

function findSubAccount(account: HederaAccount): TokenAccount | undefined {
  return findTokenSubAccount(account, token.id);
}

function makeTransactions(): CanonicalHederaTransaction[] {
  const associate: CanonicalHederaTransaction = {
    name: `Associate ${TOKEN_SYMBOL}`,
    mode: "tokenAssociate",
    assetReference: tokenId,
    assetOwner: accountId,
    token,
    amount: new BigNumber(0),
    recipient: accountId,
    expect: (previous, current) => {
      expect(current.operations.length).toBeGreaterThan(previous.operations.length);
      // An associated HTS token with no operations and a zero balance still yields a sub-account.
      const subAccount = findSubAccount(current);
      expect(subAccount).toBeDefined();
      if (!subAccount) return;
      expect(subAccount.balance.toString()).toBe("0");
    },
  };

  const sendToken: CanonicalHederaTransaction = {
    name: `Send ${TOKEN_SENT / TOKEN_UNIT} ${TOKEN_SYMBOL} to a freshly associated account`,
    mode: "send",
    subAccountId: encodeTokenAccountId(makeHederaAccount(accountId, "").id, token),
    amount: new BigNumber(TOKEN_SENT),
    recipient: tokenRecipientId,
    expect: (previous, current) => {
      const previousSub = findSubAccount(previous);
      const currentSub = findSubAccount(current);
      expect(previousSub).toBeDefined();
      expect(currentSub).toBeDefined();
      if (!previousSub || !currentSub) return;
      expect(currentSub.operations.length).toBeGreaterThan(0);
      expect(currentSub.balance.toString()).toBe(previousSub.balance.minus(TOKEN_SENT).toString());
      const [latest] = currentSub.operations;
      expect(latest.type).toBe("OUT");
      expect(latest.value.toString()).toBe(String(TOKEN_SENT));
    },
  };

  const sendMaxLlt: CanonicalHederaTransaction = {
    name: `Send max ${TOKEN_SYMBOL} (drains the sub-account)`,
    mode: "send",
    subAccountId: encodeTokenAccountId(makeHederaAccount(accountId, "").id, token),
    useAllAmount: true,
    recipient: tokenRecipientId,
    expect: (previous, current) => {
      const previousSub = findSubAccount(previous);
      const currentSub = findSubAccount(current);
      expect(previousSub).toBeDefined();
      expect(currentSub).toBeDefined();
      if (!previousSub || !currentSub) return; // retryable mirror-node lag, not a TypeError
      expect(currentSub.operations.length).toBeGreaterThan(previousSub.operations.length);
      const [latest] = currentSub.operations;
      expect(latest.type).toBe("OUT");
      expect(latest.value.toString()).toBe(previousSub.balance.toString());
      expect(currentSub.balance.toString()).toBe("0");
    },
  };

  return [associate, sendToken, sendMaxLlt];
}

export function makeScenarioHederaToken<T extends TransactionCommon>(
  target: HederaBridgeTarget<T>,
): Scenario<T, HederaAccount> {
  return {
    name: "Ledger Live Hedera — HTS association and transfer",

    setup: async () => {
      // Created before `setup` so the token is known when the crypto-assets store is installed.
      tokenId = await createHtsToken({
        decimals: TOKEN_DECIMALS,
        symbol: TOKEN_SYMBOL,
        initialSupply: TOKEN_INITIAL_SUPPLY,
      });
      token = makeLocalHtsToken(tokenId);

      const {
        currencyBridge,
        accountBridge,
        publicKey,
        accountId: newAccountId,
        close,
      } = await target.setup([token]);
      closeMswHandlers = close;
      accountId = newAccountId;

      // Separate fixture account, associated via the raw SDK: RECIPIENT's key isn't ours, so it
      // can't be associated and an HTS transfer to it would fail.
      const recipientKey = PrivateKey.generateED25519();
      tokenRecipientId = await createFundedAccount(recipientKey.publicKey.toStringRaw(), 1);
      await associateToken(tokenRecipientId, recipientKey, tokenId);

      injected = false;
      beforeEachCallIndex = 0;

      return {
        currencyBridge,
        accountBridge,
        account: makeHederaAccount(accountId, publicKey),
        ...SCENARIO_RETRY_POLICY,
      };
    },

    // HTS requires the receiver to be associated first, so the treasury injection has to sit between
    // `associate` and `sendToken` — hence the call-position key. Reordering them stops it firing.
    beforeEach: async account => {
      const callIndex = beforeEachCallIndex++;
      if (callIndex === 0) return; // precedes `associate`: the sub-account cannot exist yet.
      if (injected) return;

      const subAccount = findSubAccount(account);
      if (!subAccount) {
        throw new Error(
          `hederaToken scenario: expected the ${TOKEN_SYMBOL} sub-account to exist before injecting ` +
            `the treasury transfer (beforeEach call #${callIndex + 1}, following the "associate" ` +
            "transaction), but found none. The transaction order likely changed, or sub-account " +
            "resolution regressed.",
        );
      }

      await transferToken(tokenId, account.freshAddress, TOKEN_INJECTED);
      // getTransactionStatus right after is not retried: without this, the sub-account reads 0.
      await waitForMirrorNodeTokenBalance(account.freshAddress, tokenId, TOKEN_INJECTED);
      injected = true;
    },

    getTransactions: () => makeTransactions().map(target.toTransaction),

    teardown: () => {
      closeMswHandlers?.();
    },
  };
}
