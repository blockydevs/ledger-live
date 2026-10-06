import {
  AccountId,
  Hbar,
  HbarUnit,
  Long,
  TokenAssociateTransaction,
  TransferTransaction,
  AccountUpdateTransaction,
  ContractExecuteTransaction,
  ContractFunctionParameters,
} from "@hashgraph/sdk";
import type { FeeEstimation } from "@ledgerhq/coin-module-framework/api/types";
import { getEnv } from "@ledgerhq/live-env";
import invariant from "invariant";
import { createApi } from "../api";
import { HEDERA_TRANSACTION_MODES, TINYBAR_SCALE } from "../constants";
import { rpcClient } from "../network/rpc";
import { MAINNET_TEST_ACCOUNTS } from "../test/fixtures/account.fixture";
import { getMockedConfig, getMockedContext } from "../test/fixtures/config.fixture";

describe("createApi", () => {
  const apiConfig = {
    ...getMockedConfig(),
    useNetworkTimestamp: true,
    apiUrls: {
      mirrorNode: getEnv("API_HEDERA_MIRROR"),
      hgraph: getEnv("API_HEDERA_HGRAPH"),
    },
  };
  const api = createApi("hedera");
  const context = getMockedContext(apiConfig);

  afterAll(async () => {
    await rpcClient._resetInstance();
  });

  describe("craftTransaction", () => {
    it("returns serialized native coin TransferTransaction", async () => {
      const { transaction: hex } = await api.craftTransaction(context, {
        intentType: "transaction",
        asset: {
          type: "native",
        },
        type: HEDERA_TRANSACTION_MODES.Send,
        amount: BigInt(1 * 10 ** TINYBAR_SCALE),
        sender: MAINNET_TEST_ACCOUNTS.withoutTokens.accountId,
        senderPublicKey: MAINNET_TEST_ACCOUNTS.withoutTokens.publicKey,
        recipient: MAINNET_TEST_ACCOUNTS.withTokens.accountId,
        memo: {
          kind: "text",
          type: "string",
          value: "native transfer",
        },
      });

      const rawTx = TransferTransaction.fromBytes(Buffer.from(hex, "hex"));

      expect(rawTx).toBeInstanceOf(TransferTransaction);
      invariant(rawTx instanceof TransferTransaction, "TransferTransaction type guard");

      const sendTransfer = rawTx.hbarTransfers.get(MAINNET_TEST_ACCOUNTS.withoutTokens.accountId);
      const receiveTransfer = rawTx.hbarTransfers.get(MAINNET_TEST_ACCOUNTS.withTokens.accountId);

      expect(rawTx.hbarTransfers.size).toBe(2);
      expect(sendTransfer).toEqual(Hbar.from(-1, HbarUnit.Hbar));
      expect(receiveTransfer).toEqual(Hbar.from(1, HbarUnit.Hbar));
      expect(rawTx.transactionMemo).toBe("native transfer");
    });

    it("returns serialized HTS token TransferTransaction", async () => {
      const { transaction: hex } = await api.craftTransaction(context, {
        intentType: "transaction",
        asset: {
          type: "hts",
          assetReference: "0.0.5022567",
        },
        type: HEDERA_TRANSACTION_MODES.Send,
        amount: BigInt(1),
        sender: MAINNET_TEST_ACCOUNTS.withoutTokens.accountId,
        senderPublicKey: MAINNET_TEST_ACCOUNTS.withoutTokens.publicKey,
        recipient: MAINNET_TEST_ACCOUNTS.withTokens.accountId,
        memo: {
          kind: "text",
          type: "string",
          value: "hts token transfer",
        },
      });

      const rawTx = TransferTransaction.fromBytes(Buffer.from(hex, "hex"));

      expect(rawTx).toBeInstanceOf(TransferTransaction);
      invariant(rawTx instanceof TransferTransaction, "TransferTransaction type guard");

      const tokenTransfers = rawTx.tokenTransfers.get("0.0.5022567");
      const senderTransfer = tokenTransfers?.get(MAINNET_TEST_ACCOUNTS.withoutTokens.accountId);
      const recipientTransfer = tokenTransfers?.get(MAINNET_TEST_ACCOUNTS.withTokens.accountId);

      expect(senderTransfer).toEqual(Long.fromNumber(-1));
      expect(recipientTransfer).toEqual(Long.fromNumber(1));
      expect(tokenTransfers).not.toBeNull();
      expect(rawTx.transactionMemo).toBe("hts token transfer");
    });

    it("returns serialized ERC20 token ContractExecuteTransaction", async () => {
      const { transaction: hex } = await api.craftTransaction(context, {
        intentType: "transaction",
        asset: {
          type: "erc20",
          assetReference: "0xca367694cdac8f152e33683bb36cc9d6a73f1ef2",
        },
        type: HEDERA_TRANSACTION_MODES.Send,
        amount: 1n,
        sender: MAINNET_TEST_ACCOUNTS.withoutTokens.accountId,
        senderPublicKey: MAINNET_TEST_ACCOUNTS.withoutTokens.publicKey,
        recipient: MAINNET_TEST_ACCOUNTS.withTokens.accountId,
        memo: {
          kind: "text",
          type: "string",
          value: "erc20 token transfer",
        },
        data: {
          type: "erc20",
          gasLimit: 100n,
        },
      });

      const rawTx = ContractExecuteTransaction.fromBytes(Buffer.from(hex, "hex"));
      expect(rawTx).toBeInstanceOf(ContractExecuteTransaction);
      invariant(
        rawTx instanceof ContractExecuteTransaction,
        "ContractExecuteTransaction type guard",
      );

      const expectedFunctionParameters = new ContractFunctionParameters()
        .addAddress(MAINNET_TEST_ACCOUNTS.withTokens.evmAddress)
        .addUint256(1);

      expect(rawTx.gas).toEqual(Long.fromNumber(100));
      expect(rawTx.transactionMemo).toBe("erc20 token transfer");
      expect(rawTx.functionParameters).toEqual(
        Buffer.concat([
          Buffer.from([0xa9, 0x05, 0x9c, 0xbb]), // transfer(address,uint256) selector
          Buffer.from(expectedFunctionParameters._build()), // address + amount parameters
        ]),
      );
    });

    it("returns serialized HTS token association transaction", async () => {
      const { transaction: hex } = await api.craftTransaction(context, {
        intentType: "transaction",
        asset: {
          type: "hts",
          assetReference: "0.0.5022567",
        },
        amount: BigInt(0),
        sender: MAINNET_TEST_ACCOUNTS.withoutTokens.accountId,
        senderPublicKey: MAINNET_TEST_ACCOUNTS.withoutTokens.publicKey,
        recipient: MAINNET_TEST_ACCOUNTS.withoutTokens.accountId,
        type: HEDERA_TRANSACTION_MODES.TokenAssociate,
        memo: {
          kind: "text",
          type: "string",
          value: "token association",
        },
      });

      const rawTx = TokenAssociateTransaction.fromBytes(Buffer.from(hex, "hex"));

      expect(rawTx).toBeInstanceOf(TokenAssociateTransaction);
      invariant(rawTx instanceof TokenAssociateTransaction, "TokenAssociateTransaction type guard");
      expect(rawTx.accountId).toEqual(
        AccountId.fromString(MAINNET_TEST_ACCOUNTS.withoutTokens.accountId),
      );
      // .toString() is used because sdk.TokenId.fromString() sets `_checksum` to undefined,
      // where tokenIds elements from TokenAssociateTransaction.fromBytes have it set to null
      expect(rawTx.tokenIds?.[0]?.toString()).toEqual("0.0.5022567");
      expect(rawTx.transactionMemo).toBe("token association");
    });

    it.each([
      [HEDERA_TRANSACTION_MODES.Delegate, "Stake"],
      [HEDERA_TRANSACTION_MODES.Undelegate, "Unstake"],
    ])("returns serialized %s transaction with the %s memo", async (type, expectedMemo) => {
      const { transaction: hex } = await api.craftTransaction(context, {
        intentType: "transaction",
        asset: {
          type: "native",
        },
        type,
        amount: BigInt(0),
        sender: MAINNET_TEST_ACCOUNTS.withoutTokens.accountId,
        senderPublicKey: MAINNET_TEST_ACCOUNTS.withoutTokens.publicKey,
        recipient: MAINNET_TEST_ACCOUNTS.withoutTokens.accountId,
        memo: {
          kind: "text",
          type: "string",
          value: type,
        },
      });

      const rawTx = AccountUpdateTransaction.fromBytes(Buffer.from(hex, "hex"));

      expect(rawTx).toBeInstanceOf(AccountUpdateTransaction);
      invariant(rawTx instanceof AccountUpdateTransaction, "AccountUpdateTransaction type guard");
      expect(rawTx.accountId).toEqual(
        AccountId.fromString(MAINNET_TEST_ACCOUNTS.withoutTokens.accountId),
      );
      expect(rawTx.transactionMemo).toBe(expectedMemo);
    });

    it("applies customFees properly", async () => {
      const customFees: FeeEstimation = {
        value: BigInt(1000),
      };

      const { transaction: hex } = await api.craftTransaction(
        context,
        {
          intentType: "transaction",
          asset: {
            type: "native",
          },
          amount: BigInt(1 * 10 ** TINYBAR_SCALE),
          sender: MAINNET_TEST_ACCOUNTS.withoutTokens.accountId,
          senderPublicKey: MAINNET_TEST_ACCOUNTS.withoutTokens.publicKey,
          recipient: MAINNET_TEST_ACCOUNTS.withTokens.accountId,
          type: HEDERA_TRANSACTION_MODES.Send,
          memo: {
            kind: "text",
            type: "string",
            value: "",
          },
        },
        { customFees },
      );

      const rawTx = TransferTransaction.fromBytes(Buffer.from(hex, "hex"));
      const expectedMaxFee = Hbar.from(customFees.value.toString(), HbarUnit.Tinybar);

      expect(rawTx).toBeInstanceOf(TransferTransaction);
      invariant(rawTx instanceof TransferTransaction, "TransferTransaction type guard");
      expect(rawTx.maxTransactionFee).toEqual(expectedMaxFee);
    });
  });

  describe("estimateFees", () => {
    it("returns fee for coin transfer transaction", async () => {
      const fees = await api.estimateFees(context, {
        intentType: "transaction",
        asset: {
          type: "native",
        },
        type: HEDERA_TRANSACTION_MODES.Send,
        sender: MAINNET_TEST_ACCOUNTS.withoutTokens.accountId,
        senderPublicKey: MAINNET_TEST_ACCOUNTS.withoutTokens.publicKey,
        amount: BigInt(100),
        recipient: MAINNET_TEST_ACCOUNTS.withTokens.accountId,
        memo: {
          kind: "text",
          type: "string",
          value: "",
        },
      });

      expect(fees.value).toBeGreaterThanOrEqual(0n);
    });

    it("returns fee for HTS token transfer transaction", async () => {
      const fees = await api.estimateFees(context, {
        intentType: "transaction",
        asset: {
          type: "hts",
          assetReference: "0.0.5022567",
        },
        type: HEDERA_TRANSACTION_MODES.Send,
        sender: MAINNET_TEST_ACCOUNTS.withoutTokens.accountId,
        senderPublicKey: MAINNET_TEST_ACCOUNTS.withoutTokens.publicKey,
        amount: BigInt(100),
        recipient: MAINNET_TEST_ACCOUNTS.withTokens.accountId,
        memo: {
          kind: "text",
          type: "string",
          value: "",
        },
      });

      expect(fees.value).toBeGreaterThanOrEqual(0n);
    });

    it("returns fee for ERC20 token transfer transaction", async () => {
      const fees = await api.estimateFees(context, {
        intentType: "transaction",
        asset: {
          type: "erc20",
          assetReference: "0xca367694cdac8f152e33683bb36cc9d6a73f1ef2",
        },
        type: HEDERA_TRANSACTION_MODES.Send,
        sender: MAINNET_TEST_ACCOUNTS.withoutTokens.accountId,
        senderPublicKey: MAINNET_TEST_ACCOUNTS.withoutTokens.publicKey,
        amount: 100n,
        recipient: MAINNET_TEST_ACCOUNTS.withTokens.accountId,
        memo: {
          kind: "text",
          type: "string",
          value: "",
        },
      });

      expect(fees.value).toBeGreaterThanOrEqual(0n);
    });

    it("returns fee for token association transaction", async () => {
      const fees = await api.estimateFees(context, {
        intentType: "transaction",
        asset: {
          type: "hts",
          assetReference: "0.0.5022567",
        },
        type: HEDERA_TRANSACTION_MODES.TokenAssociate,
        sender: MAINNET_TEST_ACCOUNTS.withoutTokens.accountId,
        senderPublicKey: MAINNET_TEST_ACCOUNTS.withoutTokens.publicKey,
        amount: BigInt(100),
        recipient: MAINNET_TEST_ACCOUNTS.withTokens.accountId,
        memo: {
          kind: "text",
          type: "string",
          value: "",
        },
      });

      expect(fees.value).toBeGreaterThanOrEqual(0n);
    });

    it.each([
      HEDERA_TRANSACTION_MODES.Delegate,
      HEDERA_TRANSACTION_MODES.Undelegate,
      HEDERA_TRANSACTION_MODES.ClaimRewards,
      HEDERA_TRANSACTION_MODES.Redelegate,
    ])("returns fee for %s transaction", async type => {
      const fees = await api.estimateFees(context, {
        intentType: "transaction",
        asset: {
          type: "native",
        },
        type,
        sender: MAINNET_TEST_ACCOUNTS.withoutTokens.accountId,
        senderPublicKey: MAINNET_TEST_ACCOUNTS.withoutTokens.publicKey,
        amount: BigInt(100),
        recipient: MAINNET_TEST_ACCOUNTS.withTokens.accountId,
        memo: {
          kind: "text",
          type: "string",
          value: type,
        },
      });

      expect(fees.value).toBeGreaterThanOrEqual(0n);
    });
  });

  describe("getBalance", () => {
    it("returns zero balance for pristine account", async () => {
      const balances = await api.getBalance(context, MAINNET_TEST_ACCOUNTS.pristine.accountId);

      expect(balances.length).toBe(1);
      expect(balances[0].value).toBe(0n);
    });

    it("returns empty result for non-existent account", async () => {
      const balances = await api.getBalance(context, "0.0.0");

      expect(balances).toEqual([]);
    });

    it("returns native asset for account without tokens", async () => {
      const balances = await api.getBalance(context, MAINNET_TEST_ACCOUNTS.withoutTokens.accountId);
      const nativeBalance = balances.filter(b => b.asset.type === "native");

      expect(nativeBalance.length).toBe(1);
      expect(nativeBalance[0].value).toBeGreaterThan(0n);
    });

    it("returns native and token assets for account with tokens", async () => {
      const balances = await api.getBalance(context, MAINNET_TEST_ACCOUNTS.withTokens.accountId);
      const tokenBalances = balances.filter(b => b.asset.type !== "native");

      const associatedTokenWithBalance = balances.find(b => {
        return (
          "assetReference" in b.asset &&
          b.asset.assetReference === MAINNET_TEST_ACCOUNTS.withTokens.associatedTokenWithBalance
        );
      });

      const associatedTokenWithoutBalance = balances.find(b => {
        return (
          "assetReference" in b.asset &&
          b.asset.assetReference === MAINNET_TEST_ACCOUNTS.withTokens.associatedTokenWithoutBalance
        );
      });

      const notAssociatedToken = balances.find(b => {
        return (
          "assetReference" in b.asset &&
          b.asset.assetReference === MAINNET_TEST_ACCOUNTS.withTokens.notAssociatedToken
        );
      });

      const erc20TokenBalance = balances.find(b => {
        return (
          "assetReference" in b.asset &&
          b.asset.assetReference === MAINNET_TEST_ACCOUNTS.withTokens.erc20Token
        );
      });

      expect(tokenBalances.length).toBeGreaterThan(0);
      expect(associatedTokenWithBalance?.value).toBeGreaterThan(0n);
      expect(associatedTokenWithoutBalance?.value).toBe(0n);
      expect(notAssociatedToken?.value).toBe(undefined);
      expect(erc20TokenBalance?.value).toBeGreaterThan(0n);
    });

    it("returns stake information for delegated account", async () => {
      const balances = await api.getBalance(context, MAINNET_TEST_ACCOUNTS.activeStaking.accountId);
      const nativeBalance = balances.find(b => b.asset.type === "native");

      expect(nativeBalance?.stake).toMatchObject({
        uid: MAINNET_TEST_ACCOUNTS.activeStaking.accountId,
        address: MAINNET_TEST_ACCOUNTS.activeStaking.accountId,
        asset: { type: "native" },
        state: "active",
        amount: expect.any(BigInt),
        amountDeposited: expect.any(BigInt),
        amountRewarded: expect.any(BigInt),
        delegate: expect.any(String),
      });
    });

    it("returns no stake information for non-delegated account", async () => {
      const balances = await api.getBalance(
        context,
        MAINNET_TEST_ACCOUNTS.inactiveStaking.accountId,
      );
      const nativeBalance = balances.find(b => b.asset.type === "native");

      expect(nativeBalance?.stake).toBe(undefined);
    });
  });
});
