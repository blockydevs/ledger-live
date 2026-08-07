import BigNumber from "bignumber.js";
import { of } from "rxjs";
import { genAccount } from "@ledgerhq/ledger-wallet-framework/mocks/account";
import { HEDERA_TRANSACTION_MODES } from "@ledgerhq/coin-hedera/constants";
import type {
  HederaAccount,
  StakeWithNodeDetails,
  Transaction as LegacyTransaction,
} from "@ledgerhq/coin-hedera/types";
import type { AccountRaw, AccountBridge, CurrencyBridge, ScanAccountEvent } from "@ledgerhq/types-live";
import type { TokenCurrency } from "@domain/entity-currency-token";
import { getTokenFromAsset } from "@ledgerhq/coin-hedera/logic/getTokenFromAsset";
import { getCryptoCurrencyById } from "../../currencies";
import { toLegacyTx, toGenericTx, withToken, createLegacyCompatBridges } from "./legacyBridgeCompat";
import type { Transaction } from "./types";

jest.mock("@ledgerhq/coin-hedera/logic/getTokenFromAsset", () => ({
  getTokenFromAsset: jest.fn(),
}));

const mockLegacyAccountBridge = {
  estimateMaxSpendable: jest.fn(),
  createTransaction: jest.fn(),
  updateTransaction: jest.fn(),
  getTransactionStatus: jest.fn(),
  getEstimationRecipient: jest.fn(),
  prepareTransaction: jest.fn(),
  assignToAccountRaw: jest.fn(),
  assignFromAccountRaw: jest.fn(),
  sync: jest.fn(),
  receive: jest.fn(),
  signOperation: jest.fn(),
  signRawOperation: jest.fn(),
  broadcast: jest.fn(),
  getSerializedAddressParameters: jest.fn(),
  validateAddress: jest.fn(),
  // Never implemented by the real legacy bridge, but declared here so a test can tell an
  // omitted key apart from one that was never on the spread source to begin with.
  getEditTransactionPatch: jest.fn(),
  getEditTransactionStatus: jest.fn(),
  getFormattedFeeFields: jest.fn(),
  hasMinimumFundsToCancel: jest.fn(),
  hasMinimumFundsToSpeedUp: jest.fn(),
  isStrategyDisabled: jest.fn(),
};
const mockLegacyCurrencyBridge = { preload: jest.fn(), scanAccounts: jest.fn() };

jest.mock("@ledgerhq/coin-hedera/bridge/index", () => ({
  createBridges: jest.fn(() => ({
    currencyBridge: mockLegacyCurrencyBridge,
    accountBridge: mockLegacyAccountBridge,
  })),
}));

const currency = getCryptoCurrencyById("hedera");

function genericTx(overrides: Partial<Transaction>): Transaction {
  return {
    family: "hedera",
    amount: new BigNumber(0),
    recipient: "0.0.1001",
    ...overrides,
  } as Transaction;
}

describe("legacyBridgeCompat", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("toLegacyTx / toGenericTx round-trip per mode", () => {
    it("maps send", () => {
      const tx = genericTx({
        mode: "send",
        amount: new BigNumber(100),
        recipient: "0.0.1002",
        memoValue: "hi",
        memoType: "text",
        fees: new BigNumber(10),
        gasLimit: new BigNumber(21000),
      });

      const legacy = toLegacyTx(tx);
      expect(legacy).toMatchObject({
        family: "hedera",
        mode: HEDERA_TRANSACTION_MODES.Send,
        amount: new BigNumber(100),
        recipient: "0.0.1002",
        memo: "hi",
        maxFee: new BigNumber(10),
        gasLimit: new BigNumber(21000),
      });

      const back = toGenericTx(legacy);
      expect(back).toMatchObject({
        family: "hedera",
        mode: HEDERA_TRANSACTION_MODES.Send,
        amount: new BigNumber(100),
        recipient: "0.0.1002",
        memoValue: "hi",
        memoType: "text",
        fees: new BigNumber(10),
        gasLimit: new BigNumber(21000),
      });
    });

    it("maps token-associate", () => {
      const tx = genericTx({
        mode: "token-associate",
        recipient: "0.0.1003",
        assetReference: "0.0.5005",
        assetOwner: "0.0.1003",
      });

      const legacy = toLegacyTx(tx);
      expect(legacy).toMatchObject({
        family: "hedera",
        mode: HEDERA_TRANSACTION_MODES.TokenAssociate,
        assetReference: "0.0.5005",
        assetOwner: "0.0.1003",
      });

      const token = { type: "TokenCurrency", id: "hedera/hts/mock" } as unknown as TokenCurrency;
      const legacyWithToken: LegacyTransaction = {
        ...legacy,
        properties: { token },
      } as LegacyTransaction;

      const back = toGenericTx(legacyWithToken);
      expect(back).toMatchObject({
        family: "hedera",
        mode: HEDERA_TRANSACTION_MODES.TokenAssociate,
        assetReference: "0.0.5005",
        assetOwner: "0.0.1003",
      });
      expect(back).not.toHaveProperty("properties");
    });

    it("maps delegate", () => {
      const tx = genericTx({ mode: "delegate", recipient: "0.0.1004", valId: "7" });

      const legacy = toLegacyTx(tx);
      expect(legacy).toMatchObject({
        mode: HEDERA_TRANSACTION_MODES.Delegate,
        properties: { stakingNodeId: 7 },
      });

      const back = toGenericTx(legacy);
      expect(back).toMatchObject({ mode: HEDERA_TRANSACTION_MODES.Delegate, valId: "7" });
    });

    it("maps undelegate", () => {
      const tx = genericTx({ mode: "undelegate", recipient: "0.0.1005", valId: "3" });

      const legacy = toLegacyTx(tx);
      expect(legacy).toMatchObject({
        mode: HEDERA_TRANSACTION_MODES.Undelegate,
        properties: { stakingNodeId: 3 },
      });

      const back = toGenericTx(legacy);
      expect(back).toMatchObject({ mode: HEDERA_TRANSACTION_MODES.Undelegate, valId: "3" });
    });

    it("maps redelegate", () => {
      const tx = genericTx({ mode: "redelegate", recipient: "0.0.1006", valId: "9" });

      const legacy = toLegacyTx(tx);
      expect(legacy).toMatchObject({
        mode: HEDERA_TRANSACTION_MODES.Redelegate,
        properties: { stakingNodeId: 9 },
      });

      const back = toGenericTx(legacy);
      expect(back).toMatchObject({ mode: HEDERA_TRANSACTION_MODES.Redelegate, valId: "9" });
    });

    it("maps claim-rewards", () => {
      const tx = genericTx({
        mode: HEDERA_TRANSACTION_MODES.ClaimRewards,
        recipient: "0.0.1007",
      });

      const legacy = toLegacyTx(tx);
      expect(legacy).toMatchObject({ mode: HEDERA_TRANSACTION_MODES.ClaimRewards });
      expect(legacy).not.toHaveProperty("properties");

      const back = toGenericTx(legacy);
      expect(back).toMatchObject({ mode: HEDERA_TRANSACTION_MODES.ClaimRewards });
      expect(back.valId).toBeUndefined();
    });
  });

  it("maps an absent generic mode to legacy Send", () => {
    const tx = genericTx({ recipient: "0.0.1008" });
    delete (tx as { mode?: unknown }).mode;

    expect(toLegacyTx(tx).mode).toBe(HEDERA_TRANSACTION_MODES.Send);
  });

  it("rebuilds memoType as text only when memoValue is present", () => {
    const withMemo: LegacyTransaction = {
      family: "hedera",
      amount: new BigNumber(0),
      recipient: "0.0.1009",
      memo: "note",
      mode: HEDERA_TRANSACTION_MODES.Send,
    };
    expect(toGenericTx(withMemo)).toMatchObject({ memoType: "text", memoValue: "note" });

    const withoutMemo: LegacyTransaction = {
      family: "hedera",
      amount: new BigNumber(0),
      recipient: "0.0.1009",
      mode: HEDERA_TRANSACTION_MODES.Send,
    };
    const generic = toGenericTx(withoutMemo);
    expect(generic.memoType).toBeUndefined();
  });

  it("maps an absent valId to a null stakingNodeId and back to an absent valId", () => {
    const tx = genericTx({ mode: "delegate", recipient: "0.0.1010" });

    const legacy = toLegacyTx(tx);
    expect(legacy).toMatchObject({ properties: { stakingNodeId: null } });

    const back = toGenericTx(legacy);
    expect(back.valId).toBeUndefined();
  });

  it("does not leak generic-only fields into a send legacy transaction", () => {
    const tx = genericTx({
      mode: "send",
      recipient: "0.0.1011",
      valId: "1",
      memoValue: "leak?",
      fees: new BigNumber(5),
    });

    const legacy = toLegacyTx(tx);
    expect(legacy).not.toHaveProperty("valId");
    expect(legacy).not.toHaveProperty("memoValue");
    expect(legacy).not.toHaveProperty("fees");
    expect(legacy).toMatchObject({ memo: "leak?", maxFee: new BigNumber(5) });
  });

  it("throws on an unknown generic mode, naming the mode", () => {
    const tx = genericTx({ mode: "changeTrust" as Transaction["mode"] });
    expect(() => toLegacyTx(tx)).toThrow("changeTrust");
  });

  it("throws on an unknown legacy mode, naming the mode", () => {
    const legacy = {
      family: "hedera",
      amount: new BigNumber(0),
      recipient: "0.0.1012",
      mode: "unknown-mode",
    } as unknown as LegacyTransaction;

    expect(() => toGenericTx(legacy)).toThrow("unknown-mode");
  });

  describe("withToken", () => {
    const account = genAccount("hedera-legacy-bridge-compat", { currency });

    const tokenAssociateTx: LegacyTransaction = {
      family: "hedera",
      amount: new BigNumber(0),
      recipient: "0.0.1013",
      mode: HEDERA_TRANSACTION_MODES.TokenAssociate,
      assetReference: "0.0.6006",
      assetOwner: "0.0.1013",
      properties: undefined,
    } as unknown as LegacyTransaction;

    it("returns non-token-associate transactions unchanged", async () => {
      const sendTx: LegacyTransaction = {
        family: "hedera",
        amount: new BigNumber(0),
        recipient: "0.0.1014",
        mode: HEDERA_TRANSACTION_MODES.Send,
      };

      await expect(withToken(sendTx, account)).resolves.toBe(sendTx);
      expect(getTokenFromAsset).not.toHaveBeenCalled();
    });

    it("throws when the token cannot be resolved, naming the asset reference", async () => {
      jest.mocked(getTokenFromAsset).mockResolvedValue(undefined);

      await expect(withToken(tokenAssociateTx, account)).rejects.toThrow("0.0.6006");
    });

    it("fills in properties.token when the store resolves the token", async () => {
      const token = { type: "TokenCurrency", id: "hedera/hts/mock" } as unknown as TokenCurrency;
      jest.mocked(getTokenFromAsset).mockResolvedValue(token);

      const result = await withToken(tokenAssociateTx, account);
      expect(result).toMatchObject({ properties: { token } });
      expect(getTokenFromAsset).toHaveBeenCalledWith(account.currency, {
        type: "hts",
        assetReference: "0.0.6006",
        assetOwner: "0.0.1013",
      });
    });
  });

  describe("createLegacyCompatBridges", () => {
    const signerContext = jest.fn() as never;
    const getCurrencyConfig = jest.fn();

    function buildBridges(): {
      accountBridge: AccountBridge<Transaction, HederaAccount>;
      currencyBridge: CurrencyBridge;
    } {
      return createLegacyCompatBridges(signerContext, getCurrencyConfig) as {
        accountBridge: AccountBridge<Transaction, HederaAccount>;
        currencyBridge: CurrencyBridge;
      };
    }

    it("never places the six unimplemented extension methods as own properties", () => {
      const { accountBridge } = buildBridges();

      for (const key of [
        "getEditTransactionPatch",
        "getEditTransactionStatus",
        "getFormattedFeeFields",
        "hasMinimumFundsToCancel",
        "hasMinimumFundsToSpeedUp",
        "isStrategyDisabled",
      ]) {
        expect(Object.prototype.hasOwnProperty.call(accountBridge, key)).toBe(false);
      }
    });

    it("persists and restores stakingPositions through assignToAccountRaw/assignFromAccountRaw", () => {
      const { accountBridge } = buildBridges();
      const stake: StakeWithNodeDetails = {
        uid: "0.0.2001",
        address: "0.0.2001",
        delegate: "7",
        state: "active",
        actions: [],
        asset: { type: "native" },
        amount: 1_000_000n,
      };
      const account = { ...genAccount("hedera-assign-raw", { currency }), stakingPositions: [stake] };
      const accountRaw = { id: account.id, stakingPositions: [] } as unknown as AccountRaw;

      accountBridge.assignToAccountRaw!(account, accountRaw);
      expect((accountRaw as { stakingPositions?: unknown[] }).stakingPositions).toMatchObject([
        { uid: "0.0.2001", delegate: "7", amount: "1000000" },
      ]);

      const restored = { ...genAccount("hedera-assign-raw-2", { currency }) };
      accountBridge.assignFromAccountRaw!(accountRaw, restored);
      expect((restored as HederaAccount).stakingPositions).toMatchObject([
        { uid: "0.0.2001", delegate: "7", amount: 1_000_000n },
      ]);
    });

    it("round-trips valId/memoValue through prepareTransaction", async () => {
      const { accountBridge } = buildBridges();
      const account = genAccount("hedera-prepare", { currency });
      const tx = genericTx({ mode: "delegate", recipient: "0.0.3001", valId: "5", memoValue: "stake" });

      mockLegacyAccountBridge.prepareTransaction.mockImplementation(
        (_account: unknown, legacyTx: LegacyTransaction) =>
          Promise.resolve({ ...legacyTx, maxFee: new BigNumber(1) }),
      );

      const prepared = await accountBridge.prepareTransaction(account, tx);

      const [, legacyArg] = mockLegacyAccountBridge.prepareTransaction.mock.calls[0];
      expect(legacyArg).toMatchObject({
        mode: HEDERA_TRANSACTION_MODES.Delegate,
        properties: { stakingNodeId: 5 },
        memo: "stake",
      });
      expect(prepared).toMatchObject({ valId: "5", memoValue: "stake" });
    });

    it("returns a generic-shaped transaction from createTransaction", () => {
      const { accountBridge } = buildBridges();
      const account = genAccount("hedera-create", { currency });
      mockLegacyAccountBridge.createTransaction.mockReturnValue({
        family: "hedera",
        amount: new BigNumber(0),
        recipient: "0.0.4001",
        mode: HEDERA_TRANSACTION_MODES.Send,
      });

      const tx = accountBridge.createTransaction(account);

      expect(tx).toMatchObject({ family: "hedera", mode: HEDERA_TRANSACTION_MODES.Send });
    });

    it("applies a generic patch via updateTransaction without dropping generic-only fields", () => {
      const { accountBridge } = buildBridges();
      const tx = genericTx({ mode: "token-associate", assetReference: "0.0.5001", assetOwner: "0.0.5002" });

      const updated = accountBridge.updateTransaction(tx, { recipient: "0.0.5003" });

      expect(updated).toMatchObject({
        assetReference: "0.0.5001",
        assetOwner: "0.0.5002",
        recipient: "0.0.5003",
      });
    });

    it("throws through prepareTransaction for a token-associate transaction with no resolvable token", async () => {
      const { accountBridge } = buildBridges();
      const account = genAccount("hedera-token-associate-fail", { currency });
      const tx = genericTx({
        mode: "token-associate",
        recipient: "0.0.6001",
        assetReference: "0.0.7001",
        assetOwner: "0.0.6001",
      });
      jest.mocked(getTokenFromAsset).mockResolvedValue(undefined);

      await expect(accountBridge.prepareTransaction(account, tx)).rejects.toThrow("0.0.7001");
      expect(mockLegacyAccountBridge.prepareTransaction).not.toHaveBeenCalled();
    });

    it("passes getTransactionStatus a legacy-shaped transaction and returns the legacy result unchanged", async () => {
      const { accountBridge } = buildBridges();
      const account = genAccount("hedera-status", { currency });
      const tx = genericTx({ mode: "send", recipient: "0.0.8001", memoValue: "note" });
      const status = { errors: {}, warnings: {}, estimatedFees: new BigNumber(1) };
      mockLegacyAccountBridge.getTransactionStatus.mockResolvedValue(status);

      const result = await accountBridge.getTransactionStatus(account, tx);

      expect(result).toBe(status);
      const [, legacyArg] = mockLegacyAccountBridge.getTransactionStatus.mock.calls[0];
      expect(legacyArg).toMatchObject({
        mode: HEDERA_TRANSACTION_MODES.Send,
        recipient: "0.0.8001",
        memo: "note",
      });
    });

    it("passes estimateMaxSpendable's arguments through untranslated", async () => {
      const { accountBridge } = buildBridges();
      const account = genAccount("hedera-estimate", { currency });
      const tx = genericTx({ mode: "delegate", recipient: "0.0.8002", valId: "3" });
      mockLegacyAccountBridge.estimateMaxSpendable.mockResolvedValue(new BigNumber(42));

      const result = await accountBridge.estimateMaxSpendable({
        account,
        parentAccount: undefined,
        transaction: tx,
      });

      expect(result).toMatchObject(new BigNumber(42));
      expect(mockLegacyAccountBridge.estimateMaxSpendable).toHaveBeenCalledWith({
        account,
        parentAccount: undefined,
        transaction: tx,
      });
    });

    it("passes estimateMaxSpendable's arguments through when no transaction is given", async () => {
      const { accountBridge } = buildBridges();
      const account = genAccount("hedera-estimate-no-tx", { currency });
      mockLegacyAccountBridge.estimateMaxSpendable.mockResolvedValue(new BigNumber(7));

      await accountBridge.estimateMaxSpendable({ account, parentAccount: undefined });

      expect(mockLegacyAccountBridge.estimateMaxSpendable).toHaveBeenCalledWith({
        account,
        parentAccount: undefined,
        transaction: undefined,
      });
    });

    describe("signOperation", () => {
      const account = genAccount("hedera-sign", { currency });
      const tx = genericTx({ mode: "send", recipient: "0.0.9001" });

      it("does not call withToken until the returned Observable is subscribed", () => {
        const { accountBridge } = buildBridges();

        accountBridge.signOperation({ account, transaction: tx, deviceId: "device-1" });

        expect(getTokenFromAsset).not.toHaveBeenCalled();
        expect(mockLegacyAccountBridge.signOperation).not.toHaveBeenCalled();
      });

      it("forwards the rest of arg0 and a legacy-shaped transaction to the legacy signOperation once subscribed", done => {
        const { accountBridge } = buildBridges();
        mockLegacyAccountBridge.signOperation.mockReturnValue(of());

        accountBridge
          .signOperation({ account, transaction: tx, deviceId: "device-1" })
          .subscribe({
            complete: () => {
              expect(mockLegacyAccountBridge.signOperation).toHaveBeenCalledTimes(1);
              const [arg0] = mockLegacyAccountBridge.signOperation.mock.calls[0];
              expect(arg0).toMatchObject({
                deviceId: "device-1",
                transaction: { mode: HEDERA_TRANSACTION_MODES.Send, recipient: "0.0.9001" },
              });
              done();
            },
          });
      });

      it("surfaces a rejected withToken as an Observable error, not a synchronous throw", done => {
        const { accountBridge } = buildBridges();
        const associateTx = genericTx({
          mode: "token-associate",
          recipient: "0.0.9002",
          assetReference: "0.0.9003",
          assetOwner: "0.0.9002",
        });
        jest.mocked(getTokenFromAsset).mockResolvedValue(undefined);

        let thrown = false;
        let observable: ReturnType<typeof accountBridge.signOperation> | undefined;
        try {
          observable = accountBridge.signOperation({
            account,
            transaction: associateTx,
            deviceId: "device-1",
          });
        } catch {
          thrown = true;
        }

        expect(thrown).toBe(false);
        expect(mockLegacyAccountBridge.signOperation).not.toHaveBeenCalled();

        observable!.subscribe({
          error: (err: unknown) => {
            expect(String(err)).toContain("0.0.9003");
            done();
          },
        });
      });
    });

    describe("sync — deriving stakingPositions from hederaResources.delegation", () => {
      it("produces a matching stakingPositions entry when the legacy shape carries a delegation", done => {
        const { accountBridge } = buildBridges();
        const initialAccount = genAccount("hedera-sync-delegated", { currency }) as HederaAccount;
        const updater = (account: HederaAccount): HederaAccount => ({
          ...account,
          freshAddress: "0.0.9101",
          hederaResources: {
            maxAutomaticTokenAssociations: 0,
            isAutoTokenAssociationEnabled: false,
            delegation: {
              nodeId: 20,
              delegated: new BigNumber("1000000"),
              pendingReward: new BigNumber("42"),
            },
          },
        });
        mockLegacyAccountBridge.sync.mockReturnValue(of(updater));

        accountBridge.sync(initialAccount, { paginationConfig: {} }).subscribe({
          next: (applied: (a: HederaAccount) => HederaAccount) => {
            const result = applied(initialAccount);
            expect(result.stakingPositions).toMatchObject([
              {
                uid: "0.0.9101",
                address: "0.0.9101",
                amount: 1_000_042n,
                amountDeposited: 1_000_000n,
                amountRewarded: 42n,
                details: { stakedNodeId: 20, overstaked: null },
              },
            ]);
            done();
          },
        });
      });

      it("clears a previously-populated stakingPositions to [] when the delegation is null", done => {
        const { accountBridge } = buildBridges();
        const previousStake: StakeWithNodeDetails = {
          uid: "0.0.9102",
          address: "0.0.9102",
          state: "active",
          actions: [],
          asset: { type: "native" },
          amount: 5_000_000n,
        };
        const initialAccount = {
          ...genAccount("hedera-sync-undelegated", { currency }),
          stakingPositions: [previousStake],
        } as HederaAccount;
        const updater = (account: HederaAccount): HederaAccount => ({
          ...account,
          hederaResources: {
            maxAutomaticTokenAssociations: 0,
            isAutoTokenAssociationEnabled: false,
            delegation: null,
          },
        });
        mockLegacyAccountBridge.sync.mockReturnValue(of(updater));

        accountBridge.sync(initialAccount, { paginationConfig: {} }).subscribe({
          next: (applied: (a: HederaAccount) => HederaAccount) => {
            const result = applied(initialAccount);
            expect(result.stakingPositions).toEqual([]);
            done();
          },
        });
      });
    });

    describe("scanAccounts — deriving stakingPositions on account discovery", () => {
      it("adds a matching stakingPositions entry to a discovered account with a delegation", done => {
        const { currencyBridge } = buildBridges();
        const discoveredAccount = {
          ...genAccount("hedera-scan-delegated", { currency }),
          freshAddress: "0.0.9201",
          hederaResources: {
            maxAutomaticTokenAssociations: 0,
            isAutoTokenAssociationEnabled: false,
            delegation: {
              nodeId: 7,
              delegated: new BigNumber("2000000"),
              pendingReward: new BigNumber("10"),
            },
          },
        } as HederaAccount;
        mockLegacyCurrencyBridge.scanAccounts.mockReturnValue(
          of({ type: "discovered", account: discoveredAccount }),
        );

        currencyBridge.scanAccounts({} as never).subscribe({
          next: (event: ScanAccountEvent) => {
            expect((event.account as HederaAccount).stakingPositions).toMatchObject([
              {
                uid: "0.0.9201",
                address: "0.0.9201",
                amount: 2_000_010n,
                amountDeposited: 2_000_000n,
                amountRewarded: 10n,
                details: { stakedNodeId: 7, overstaked: null },
              },
            ]);
            done();
          },
        });
      });

      it("gives a discovered account with no delegation an empty stakingPositions", done => {
        const { currencyBridge } = buildBridges();
        const discoveredAccount = {
          ...genAccount("hedera-scan-undelegated", { currency }),
          hederaResources: {
            maxAutomaticTokenAssociations: 0,
            isAutoTokenAssociationEnabled: false,
            delegation: null,
          },
        } as HederaAccount;
        mockLegacyCurrencyBridge.scanAccounts.mockReturnValue(
          of({ type: "discovered", account: discoveredAccount }),
        );

        currencyBridge.scanAccounts({} as never).subscribe({
          next: (event: ScanAccountEvent) => {
            expect((event.account as HederaAccount).stakingPositions).toEqual([]);
            done();
          },
        });
      });

      it("passes through non-discovered events unchanged", done => {
        const { currencyBridge } = buildBridges();
        const otherEvent = { type: "other-event" } as unknown as ScanAccountEvent;
        mockLegacyCurrencyBridge.scanAccounts.mockReturnValue(of(otherEvent));

        currencyBridge.scanAccounts({} as never).subscribe({
          next: event => {
            expect(event).toBe(otherEvent);
            done();
          },
        });
      });

      it("keeps preload and other currency-bridge members from the legacy bridge", () => {
        const { currencyBridge } = buildBridges();

        expect(currencyBridge.preload).toBe(mockLegacyCurrencyBridge.preload);
      });
    });
  });
});
