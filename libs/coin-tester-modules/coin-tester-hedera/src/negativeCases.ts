import BigNumber from "bignumber.js";
import type { AccountBridge } from "@ledgerhq/types-live";
import type { TokenCurrency } from "@ledgerhq/types-cryptoassets";
import type { Transaction, HederaAccount, TransactionStatus } from "@ledgerhq/coin-hedera/types";
import { HEDERA_MAX_MEMO_SIZE } from "@ledgerhq/coin-hedera/logic/validateMemo";
import { encodeTokenAccountId } from "@ledgerhq/ledger-wallet-framework/account";
import {
  TOKEN_DECIMALS,
  TOKEN_SYMBOL,
  RECIPIENT,
  makeHederaAccount,
  makeLocalHtsToken,
  makeLocalErc20Token,
} from "./fixtures";
import { setupHederaScenario } from "./helpers";
import {
  createHtsToken,
  transferToken,
  waitForMirrorNodeTokenBalance,
  deployErc20Token,
  transferErc20,
  waitForErc20Balance,
  waitForMirrorNodeEvmAddress,
} from "./genesis";
import { registerErc20Token, resetErc20Tokens, refresh } from "./hgraphFake";

const UNIT = 10 ** TOKEN_DECIMALS;
const TOKEN_INITIAL_SUPPLY = 1_000 * UNIT;
const TOKEN_INJECTED = 100 * UNIT;
const ERC20_SEED_AMOUNT = 100 * UNIT;
const MAX_AUTO_ASSOCIATIONS = 10;
const ONE_HBAR_IN_TINYBAR = 100_000_000;
const NEGATIVE_CASES_SETUP_TIMEOUT_MS = 120_000;

/**
 * Well-formed but nonexistent account. `toEVMAddress` (coin-hedera network/utils.ts:303-320)
 * catches the mirror-node 404 and returns null, which is the only deterministic way into the
 * craft-time `invariant(recipientEvmAddress, ...)`. RECIPIENT (0.0.1002) will NOT do: it is a
 * Solo-funded account created without an alias, and the mirror node reports a long-zero
 * evm_address for such accounts.
 */
const NONEXISTENT_RECIPIENT = "0.0.999999999";

/**
 * Fold the sync observable into a synced account without importing rxjs. Shared by the HTS and
 * ERC20 negative-case setups so a future fix to this logic doesn't have to land twice.
 */
async function syncAccount(
  accountBridge: AccountBridge<Transaction, HederaAccount, TransactionStatus>,
  initial: HederaAccount,
): Promise<HederaAccount> {
  return new Promise<HederaAccount>((resolve, reject) => {
    let acc = initial;
    accountBridge.sync(initial, { paginationConfig: {} }).subscribe({
      next: (update: (a: HederaAccount) => HederaAccount) => {
        acc = update(acc);
      },
      error: reject,
      complete: () => resolve(acc),
    });
  });
}

/**
 * Shared shape behind every negative case in this file: build a transaction, patch it, prepare
 * it, and read back its status — never broadcast. Parameterised over bridge/account so both the
 * HTS and ERC20 blocks (each with their own bridge/account pair) can share it instead of
 * reimplementing these four steps.
 */
async function buildStatusFor(
  accountBridge: AccountBridge<Transaction, HederaAccount, TransactionStatus>,
  account: HederaAccount,
  patch: Partial<Transaction>,
): Promise<TransactionStatus> {
  let tx = accountBridge.createTransaction(account);
  tx = { ...tx, ...patch } as Transaction;
  tx = await accountBridge.prepareTransaction(account, tx);
  return accountBridge.getTransactionStatus(account, tx);
}

/**
 * Bridge-level validation runner for cases `executeScenario` cannot cover: asserts directly
 * against `getTransactionStatus` instead of broadcasting. Call from inside the existing
 * `describe("Hedera")` in scenarii.test.ts so it shares that Solo cluster.
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

      await transferToken(tokenId, accountId, TOKEN_INJECTED);
      await waitForMirrorNodeTokenBalance(accountId, tokenId, TOKEN_INJECTED);

      const initial = makeHederaAccount(accountId, publicKey);
      if (currencyBridge.preload) {
        const data = await currencyBridge.preload(initial.currency);
        currencyBridge.hydrate?.(data, initial.currency);
      }

      account = await syncAccount(accountBridge, initial);

      tokenSubAccountId = encodeTokenAccountId(account.id, token);
    }, NEGATIVE_CASES_SETUP_TIMEOUT_MS);

    afterAll(() => {
      // The parent `afterAll` in scenarii.test.ts still runs last and owns teardownSolo.
      closeMswHandlers?.();
    });

    const buildStatus = (patch: Partial<Transaction>): Promise<TransactionStatus> =>
      buildStatusFor(accountBridge, account, patch);

    it("flags insufficient funds (NotEnoughBalance)", async () => {
      const status = await buildStatus({
        recipient: RECIPIENT,
        amount: account.balance.plus(ONE_HBAR_IN_TINYBAR),
      });
      expect(status.errors.amount?.name).toBe("NotEnoughBalance");
    });

    it("flags a malformed recipient accountId (InvalidAddress)", async () => {
      const status = await buildStatus({
        recipient: "not-an-account",
        amount: new BigNumber(ONE_HBAR_IN_TINYBAR),
      });
      expect(status.errors.recipient?.name).toBe("InvalidAddress");
    });

    it("warns on an HTS transfer to an unassociated recipient (HederaRecipientTokenAssociationRequired)", async () => {
      const status = await buildStatus({
        subAccountId: tokenSubAccountId,
        recipient: RECIPIENT, // 0.0.1002 exists but is NOT associated with this token
        amount: new BigNumber(UNIT),
      });
      expect(status.warnings.missingAssociation?.name).toBe(
        "HederaRecipientTokenAssociationRequired",
      );
    });

    it("flags an HTS transfer above the held token balance (NotEnoughBalance)", async () => {
      const status = await buildStatus({
        subAccountId: tokenSubAccountId,
        recipient: RECIPIENT,
        amount: new BigNumber(TOKEN_INJECTED + UNIT), // one unit over the injected sub-account balance
      });
      expect(status.errors.amount?.name).toBe("NotEnoughBalance");
    });

    // Deploys its own ERC20 contract rather than reusing scenarioHederaErc20's, to avoid coupling
    // this block to that scenario having run first.
    describe("erc20 negative cases", () => {
      let closeErc20MswHandlers: (() => void) | undefined;
      let erc20AccountBridge: AccountBridge<Transaction, HederaAccount, TransactionStatus>;
      let erc20Account: HederaAccount;
      let erc20TokenSubAccountId: string;

      beforeAll(async () => {
        // The token must be registered right after deploy: the hgraph-fake registry reset isn't
        // wired into initMswHandlers.
        const { contractId, evmAddress } = await deployErc20Token();
        registerErc20Token(contractId, evmAddress);

        const erc20Token = makeLocalErc20Token(evmAddress);

        // Stands up a second msw server while the outer block's is still live: Jest guarantees all
        // outer `it`s finish before this nested `describe` runs, so they never overlap in practice.
        const {
          currencyBridge,
          accountBridge: ab,
          publicKey,
          accountId,
          close,
        } = await setupHederaScenario([token, erc20Token], MAX_AUTO_ASSOCIATIONS);
        closeErc20MswHandlers = close;
        erc20AccountBridge = ab;

        const accountEvmAddress = await waitForMirrorNodeEvmAddress(accountId);

        // Fixture seeding: fund the account under test directly from the genesis operator,
        // bypassing the bridge entirely.
        await transferErc20(evmAddress, accountEvmAddress, ERC20_SEED_AMOUNT);

        // The seed must be confirmed as a balance, not a transfer: only addresses with a balance
        // row enter calTokenByAddress, and the transfer feed is derived from that map.
        await waitForErc20Balance(evmAddress, accountEvmAddress, ERC20_SEED_AMOUNT);

        // No beforeSync hook exists in this block, so the transfer snapshot must be taken
        // explicitly here, before the manual sync below.
        await refresh();

        const initial = makeHederaAccount(accountId, publicKey);

        // Re-runs preload/hydrate against this setup's currencyBridge (token list [token,
        // erc20Token]) since the outer beforeAll's only covered the HTS token.
        if (currencyBridge.preload) {
          const data = await currencyBridge.preload(initial.currency);
          currencyBridge.hydrate?.(data, initial.currency);
        }

        erc20Account = await syncAccount(erc20AccountBridge, initial);

        erc20TokenSubAccountId = encodeTokenAccountId(erc20Account.id, erc20Token);

        // If the sub-account never materialised, prepareTransaction falls through to the plain-HBAR
        // branch and the test below would fail on balance validation instead of naming the real
        // problem, so assert it explicitly here.
        expect(
          erc20Account.subAccounts?.some(sa => sa.id === erc20TokenSubAccountId),
        ).toBe(true);
      }, NEGATIVE_CASES_SETUP_TIMEOUT_MS);

      afterAll(() => {
        // The parent `afterAll` in scenarii.test.ts still runs last and owns teardownSolo.
        closeErc20MswHandlers?.();
        resetErc20Tokens();
      });

      it("flags an ERC20 transfer above the held token balance (NotEnoughBalance)", async () => {
        // RECIPIENT is safe here despite having no alias: this block only exercises
        // status/validation, and that path never reaches the craft-time toEVMAddress invariant.
        const status = await buildStatusFor(erc20AccountBridge, erc20Account, {
          subAccountId: erc20TokenSubAccountId,
          recipient: RECIPIENT,
          amount: new BigNumber(ERC20_SEED_AMOUNT + UNIT), // one unit over the seeded sub-account balance
        });

        expect(status.errors.amount?.name).toBe("NotEnoughBalance");
        // Not a validation rule — handleERC20TokenTransaction sets this warning unconditionally.
        // Asserted here rather than in its own `it` because all it proves is that we entered the
        // ERC20 branch instead of the HBAR or HTS one, which this case already relies on.
        expect(status.warnings.unverifiedEvmAddress?.name).toBe(
          "HederaRecipientEvmAddressVerificationRequired",
        );
      });

      it("flags a zero-amount ERC20 transfer (AmountRequired)", async () => {
        const status = await buildStatusFor(erc20AccountBridge, erc20Account, {
          subAccountId: erc20TokenSubAccountId,
          recipient: RECIPIENT,
          amount: new BigNumber(0),
        });

        expect(status.errors.amount?.name).toBe("AmountRequired");
      });

      it("flags an over-long ERC20 memo (HederaMemoExceededSizeError)", async () => {
        const status = await buildStatusFor(erc20AccountBridge, erc20Account, {
          subAccountId: erc20TokenSubAccountId,
          recipient: RECIPIENT,
          amount: new BigNumber(UNIT),
          memo: "x".repeat(HEDERA_MAX_MEMO_SIZE + 1),
        });

        expect(status.errors.transaction?.name).toBe("HederaMemoExceededSizeError");
      });

      // Deliberately duplicates the parent block's HBAR InvalidAddress case: the ERC20 branch
      // calls validateRecipient through its own code path, so a regression can hit one branch
      // and not the other. Costs nothing — no broadcast, no cluster contact.
      it("flags a malformed recipient on the ERC20 branch (InvalidAddress)", async () => {
        const status = await buildStatusFor(erc20AccountBridge, erc20Account, {
          subAccountId: erc20TokenSubAccountId,
          recipient: "not-an-account",
          amount: new BigNumber(UNIT),
        });

        expect(status.errors.recipient?.name).toBe("InvalidAddress");
      });

      it("flags an ERC20 transfer with no HBAR left to pay gas (NotEnoughBalance)", async () => {
        // Purely in-memory: the account is not drained on chain. buildStatusFor takes the account
        // as an argument, so a shallow copy with a 1-tinybar balance is enough to hit
        // `account.balance.isLessThan(estimatedFees.tinybars)`.
        const noGasAccount = { ...erc20Account, balance: new BigNumber(1) };

        // The amount MUST stay inside the sub-account balance. Both the sub-account check and the
        // parent HBAR check write errors.amount, so an over-balance amount here would go green
        // for the wrong reason and the case would never test what it claims to.
        const status = await buildStatusFor(erc20AccountBridge, noGasAccount, {
          subAccountId: erc20TokenSubAccountId,
          recipient: RECIPIENT,
          amount: new BigNumber(UNIT),
        });

        expect(status.errors.amount?.name).toBe("NotEnoughBalance");
      });

      it("rejects crafting an ERC20 transfer to a recipient with no evm_address", async () => {
        let transaction = erc20AccountBridge.createTransaction(erc20Account);
        transaction = {
          ...transaction,
          subAccountId: erc20TokenSubAccountId,
          recipient: NONEXISTENT_RECIPIENT,
          amount: new BigNumber(UNIT),
        } as Transaction;
        transaction = await erc20AccountBridge.prepareTransaction(erc20Account, transaction);

        // signOperation calls craftTransaction directly, skipping getTransactionStatus, so this is
        // the only reachable assertion for the craft-time invariant. Folded into a promise rather
        // than importing rxjs, matching syncAccount above.
        const signed = new Promise<void>((resolve, reject) => {
          erc20AccountBridge
            .signOperation({ account: erc20Account, transaction, deviceId: "" })
            .subscribe({ next: () => {}, error: reject, complete: () => resolve() });
        });

        // The exact message matters: without it the case would also pass if crafting failed for an
        // unrelated reason.
        await expect(signed).rejects.toThrow(
          `hedera: EVM address is missing ${NONEXISTENT_RECIPIENT}`,
        );
      });
    });
  });
}
