import BigNumber from "bignumber.js";
import type { AccountBridge } from "@ledgerhq/types-live";
import type { TokenCurrency } from "@ledgerhq/types-cryptoassets";
import type { Transaction, HederaAccount, TransactionStatus } from "@ledgerhq/coin-hedera/types";
import { HEDERA_MAX_MEMO_SIZE } from "@ledgerhq/coin-hedera/logic/validateMemo";
import { encodeTokenAccountId } from "@ledgerhq/ledger-wallet-framework/account";
import {
  MAX_AUTO_ASSOCIATIONS,
  ONE_HBAR_IN_TINYBAR,
  TOKEN_DECIMALS,
  TOKEN_SYMBOL,
  TOKEN_UNIT,
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

const TOKEN_INITIAL_SUPPLY = 1_000 * TOKEN_UNIT;
const TOKEN_INJECTED = 100 * TOKEN_UNIT;
const ERC20_SEED_AMOUNT = 100 * TOKEN_UNIT;
const NEGATIVE_CASES_SETUP_TIMEOUT_MS = 120_000;

// toEVMAddress returns null for a nonexistent account, reaching the craft-time invariant.
// RECIPIENT (0.0.1002) won't do: it has no alias, so the mirror node reports a long-zero
// evm_address for it instead.
const NONEXISTENT_RECIPIENT = "0.0.999999999";

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

// Call from inside scenarii.test.ts's `describe("Hedera")` so it shares that Solo cluster.
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
        amount: new BigNumber(TOKEN_UNIT),
      });
      expect(status.warnings.missingAssociation?.name).toBe(
        "HederaRecipientTokenAssociationRequired",
      );
    });

    it("flags an HTS transfer above the held token balance (NotEnoughBalance)", async () => {
      const status = await buildStatus({
        subAccountId: tokenSubAccountId,
        recipient: RECIPIENT,
        amount: new BigNumber(TOKEN_INJECTED + TOKEN_UNIT),
      });
      expect(status.errors.amount?.name).toBe("NotEnoughBalance");
    });

    // Deploys its own ERC20 contract instead of reusing scenarioHederaErc20's, so this block
    // doesn't depend on that scenario having run first.
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

        // Jest runs all outer `it`s before this nested `describe`, so this second msw server
        // never overlaps with the outer block's.
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

        // Fund the account under test directly from the genesis operator, bypassing the bridge.
        await transferErc20(evmAddress, accountEvmAddress, ERC20_SEED_AMOUNT);

        // The seed must be confirmed as a balance, not a transfer: only addresses with a balance
        // row enter calTokenByAddress, which the transfer feed is derived from.
        await waitForErc20Balance(evmAddress, accountEvmAddress, ERC20_SEED_AMOUNT);

        // No beforeSync in this block, so refresh() must run explicitly before the sync below.
        await refresh();

        const initial = makeHederaAccount(accountId, publicKey);

        // Re-runs preload/hydrate against this setup's currencyBridge (token list [token,
        // erc20Token]): the outer beforeAll's only covered the HTS token.
        if (currencyBridge.preload) {
          const data = await currencyBridge.preload(initial.currency);
          currencyBridge.hydrate?.(data, initial.currency);
        }

        erc20Account = await syncAccount(erc20AccountBridge, initial);

        erc20TokenSubAccountId = encodeTokenAccountId(erc20Account.id, erc20Token);

        expect(erc20Account.subAccounts?.some(sa => sa.id === erc20TokenSubAccountId)).toBe(true);
      }, NEGATIVE_CASES_SETUP_TIMEOUT_MS);

      afterAll(() => {
        // The parent `afterAll` in scenarii.test.ts still runs last and owns teardownSolo.
        closeErc20MswHandlers?.();
        resetErc20Tokens();
      });

      it("flags an ERC20 transfer above the held token balance (NotEnoughBalance)", async () => {
        // RECIPIENT is safe here: this only exercises status/validation, which never reaches
        // the craft-time toEVMAddress invariant.
        const status = await buildStatusFor(erc20AccountBridge, erc20Account, {
          subAccountId: erc20TokenSubAccountId,
          recipient: RECIPIENT,
          amount: new BigNumber(ERC20_SEED_AMOUNT + TOKEN_UNIT),
        });

        expect(status.errors.amount?.name).toBe("NotEnoughBalance");
        // Not a validation rule: handleERC20TokenTransaction sets this warning unconditionally.
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
          amount: new BigNumber(TOKEN_UNIT),
          memo: "x".repeat(HEDERA_MAX_MEMO_SIZE + 1),
        });

        expect(status.errors.transaction?.name).toBe("HederaMemoExceededSizeError");
      });

      it("flags a malformed recipient on the ERC20 branch (InvalidAddress)", async () => {
        const status = await buildStatusFor(erc20AccountBridge, erc20Account, {
          subAccountId: erc20TokenSubAccountId,
          recipient: "not-an-account",
          amount: new BigNumber(TOKEN_UNIT),
        });

        expect(status.errors.recipient?.name).toBe("InvalidAddress");
      });

      it("flags an ERC20 transfer with no HBAR left to pay gas (NotEnoughBalance)", async () => {
        // In-memory only: buildStatusFor takes the account as data, so a shallow copy with a
        // 1-tinybar balance is enough.
        const noGasAccount = { ...erc20Account, balance: new BigNumber(1) };

        // amount must stay inside the sub-account balance: both that check and the parent HBAR
        // check write errors.amount, so an over-balance amount would pass for the wrong reason.
        const status = await buildStatusFor(erc20AccountBridge, noGasAccount, {
          subAccountId: erc20TokenSubAccountId,
          recipient: RECIPIENT,
          amount: new BigNumber(TOKEN_UNIT),
        });

        expect(status.errors.amount?.name).toBe("NotEnoughBalance");
      });

      it("rejects crafting an ERC20 transfer to a recipient with no evm_address", async () => {
        let transaction = erc20AccountBridge.createTransaction(erc20Account);
        transaction = {
          ...transaction,
          subAccountId: erc20TokenSubAccountId,
          recipient: NONEXISTENT_RECIPIENT,
          amount: new BigNumber(TOKEN_UNIT),
        } as Transaction;
        transaction = await erc20AccountBridge.prepareTransaction(erc20Account, transaction);

        // signOperation calls craftTransaction directly, skipping getTransactionStatus — this is
        // the only reachable assertion for the craft-time invariant.
        const signed = new Promise<void>((resolve, reject) => {
          erc20AccountBridge
            .signOperation({ account: erc20Account, transaction, deviceId: "" })
            .subscribe({ next: () => {}, error: reject, complete: () => resolve() });
        });

        await expect(signed).rejects.toThrow(
          `hedera: EVM address is missing ${NONEXISTENT_RECIPIENT}`,
        );
      });
    });
  });
}
