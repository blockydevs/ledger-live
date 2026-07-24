import BigNumber from "bignumber.js";
import type { AccountBridge } from "@ledgerhq/types-live";
import type { TokenCurrency } from "@ledgerhq/types-cryptoassets";
import type { Transaction, HederaAccount, TransactionStatus } from "@ledgerhq/coin-hedera/types";
import { encodeTokenAccountId } from "@ledgerhq/ledger-wallet-framework/account";
import { TOKEN_DECIMALS, TOKEN_SYMBOL, RECIPIENT, makeHederaAccount, makeLocalHtsToken } from "./fixtures";
import { setupHederaScenario } from "./helpers";
import { createHtsToken, transferToken, waitForMirrorNodeTokenBalance } from "./genesis";

const UNIT = 10 ** TOKEN_DECIMALS;
const TOKEN_INITIAL_SUPPLY = 1_000 * UNIT;
const TOKEN_INJECTED = 100 * UNIT;
const MAX_AUTO_ASSOCIATIONS = 10;
const ONE_HBAR_IN_TINYBAR = 100_000_000;
const NEGATIVE_CASES_SETUP_TIMEOUT_MS = 120_000;

/**
 * Bridge-level validation runner for cases that `executeScenario` cannot cover — it broadcasts
 * and throws on any status error, so these are asserted directly against `getTransactionStatus`
 * instead. Meant to be called from *inside* the existing `describe("Hedera")` in
 * `scenarii.test.ts` (a nested `describe` never triggers a second Solo bring-up), so it shares
 * the one already-running Solo cluster. Does not deploy/tear down Solo itself.
 */
export function describeNegativeCases(): void {
  describe("negative cases", () => {
    let closeMswHandlers: (() => void) | undefined;
    let accountBridge: AccountBridge<Transaction, HederaAccount, TransactionStatus>;
    let account: HederaAccount;
    let token: TokenCurrency;
    let tokenSubAccountId: string;

    beforeAll(async () => {
      const tokenId = await createHtsToken({
        decimals: TOKEN_DECIMALS,
        symbol: TOKEN_SYMBOL,
        initialSupply: TOKEN_INITIAL_SUPPLY,
      });
      token = makeLocalHtsToken(tokenId);

      const {
        currencyBridge,
        accountBridge: ab,
        publicKey,
        accountId,
        close,
      } = await setupHederaScenario([token], MAX_AUTO_ASSOCIATIONS);
      closeMswHandlers = close;
      accountBridge = ab;

      // Inject the sender's token balance (auto-associates on receipt), then wait for indexing:
      // the sync below must observe it, or case 3's HTS transfer cannot be built.
      await transferToken(tokenId, accountId, TOKEN_INJECTED);
      await waitForMirrorNodeTokenBalance(accountId, tokenId, TOKEN_INJECTED);

      const initial = makeHederaAccount(accountId, publicKey);
      if (currencyBridge.preload) {
        const data = await currencyBridge.preload(initial.currency);
        currencyBridge.hydrate?.(data, initial.currency);
      }

      // Fold the sync observable into a synced account without importing rxjs (not a direct dep).
      account = await new Promise<HederaAccount>((resolve, reject) => {
        let acc = initial;
        accountBridge.sync(initial, { paginationConfig: {} }).subscribe({
          next: (update: (a: HederaAccount) => HederaAccount) => {
            acc = update(acc);
          },
          error: reject,
          complete: () => resolve(acc),
        });
      });

      tokenSubAccountId = encodeTokenAccountId(account.id, token);
    }, NEGATIVE_CASES_SETUP_TIMEOUT_MS);

    afterAll(() => {
      // The parent `afterAll` in scenarii.test.ts still runs last and owns teardownSolo.
      closeMswHandlers?.();
    });

    const buildStatus = async (patch: Partial<Transaction>): Promise<TransactionStatus> => {
      let tx = accountBridge.createTransaction(account);
      tx = { ...tx, ...patch } as Transaction;
      tx = await accountBridge.prepareTransaction(account, tx);
      return accountBridge.getTransactionStatus(account, tx);
    };

    it("flags insufficient funds (NotEnoughBalance)", async () => {
      const status = await buildStatus({
        recipient: RECIPIENT, // valid existing account, so amount is the only error
        amount: account.balance.plus(ONE_HBAR_IN_TINYBAR), // > balance
      });
      expect(status.errors.amount?.name).toBe("NotEnoughBalance");
    });

    it("flags a malformed recipient accountId (InvalidAddress)", async () => {
      const status = await buildStatus({
        recipient: "not-an-account",
        amount: new BigNumber(ONE_HBAR_IN_TINYBAR), // small valid amount, so recipient is the isolated error
      });
      expect(status.errors.recipient?.name).toBe("InvalidAddress");
    });

    it("warns on an HTS transfer to an unassociated recipient (HederaRecipientTokenAssociationRequired)", async () => {
      const status = await buildStatus({
        subAccountId: tokenSubAccountId,
        recipient: RECIPIENT, // 0.0.1002 exists but is NOT associated with this token
        amount: new BigNumber(UNIT), // > 0 and <= injected balance, so it isolates the association warning
      });
      expect(status.warnings.missingAssociation?.name).toBe(
        "HederaRecipientTokenAssociationRequired",
      );
    });
  });
}
