import type { FeeEstimation } from "@ledgerhq/coin-module-framework/api/types";
import { NotEnoughBalance, RecipientRequired } from "@ledgerhq/ledger-wallet-framework/errors";
import { getEnv } from "@ledgerhq/live-env";
import invariant from "invariant";
import { createApi } from "../api";
import { HEDERA_TRANSACTION_MODES } from "../constants";
import {
  HederaInsufficientFundsForAssociation,
  HederaInvalidStakingNodeIdError,
  HederaMemoExceededSizeError,
  HederaNoStakingRewardsError,
  HederaRedundantStakingNodeIdError,
} from "../errors";
import { HEDERA_MAX_MEMO_SIZE } from "../logic/validateMemo";
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

  describe("validateIntent", () => {
    describe("native send", () => {
      it("completes with no errors for a well-formed send", async () => {
        const balances = await api.getBalance(
          context,
          MAINNET_TEST_ACCOUNTS.withoutTokens.accountId,
        );

        const result = await api.validateIntent(
          context,
          {
            intentType: "transaction",
            type: HEDERA_TRANSACTION_MODES.Send,
            asset: { type: "native" },
            sender: MAINNET_TEST_ACCOUNTS.withoutTokens.accountId,
            recipient: MAINNET_TEST_ACCOUNTS.withTokens.accountId,
            amount: 100n,
            memo: { kind: "text", type: "string", value: "" },
          },
          balances,
        );

        expect(result.errors).toEqual({});
        expect(result.amount).toBe(100n);
        expect(result.estimatedFees).toBeGreaterThan(0n);
        expect(result.totalSpent).toBe(100n + result.estimatedFees);
      });

      it("adds errors.recipient for an empty recipient", async () => {
        const balances = await api.getBalance(
          context,
          MAINNET_TEST_ACCOUNTS.withoutTokens.accountId,
        );

        const result = await api.validateIntent(
          context,
          {
            intentType: "transaction",
            type: HEDERA_TRANSACTION_MODES.Send,
            asset: { type: "native" },
            sender: MAINNET_TEST_ACCOUNTS.withoutTokens.accountId,
            recipient: "",
            amount: 100n,
            memo: { kind: "text", type: "string", value: "" },
          },
          balances,
        );

        expect(result.errors.recipient).toBeInstanceOf(RecipientRequired);
      });

      it("adds errors.amount = NotEnoughBalance for a pristine (zero-balance) account", async () => {
        const balances = await api.getBalance(context, MAINNET_TEST_ACCOUNTS.pristine.accountId);

        const result = await api.validateIntent(
          context,
          {
            intentType: "transaction",
            type: HEDERA_TRANSACTION_MODES.Send,
            asset: { type: "native" },
            sender: MAINNET_TEST_ACCOUNTS.pristine.accountId,
            recipient: MAINNET_TEST_ACCOUNTS.withTokens.accountId,
            amount: 10n,
            memo: { kind: "text", type: "string", value: "" },
          },
          balances,
        );

        expect(result.errors.amount).toBeInstanceOf(NotEnoughBalance);
      });
    });

    describe("hts token send", () => {
      it("completes with no errors for a well-formed token send", async () => {
        const balances = await api.getBalance(context, MAINNET_TEST_ACCOUNTS.withTokens.accountId);

        const result = await api.validateIntent(
          context,
          {
            intentType: "transaction",
            type: HEDERA_TRANSACTION_MODES.Send,
            asset: {
              type: "hts",
              assetReference: MAINNET_TEST_ACCOUNTS.withTokens.associatedTokenWithBalance,
            },
            sender: MAINNET_TEST_ACCOUNTS.withTokens.accountId,
            recipient: MAINNET_TEST_ACCOUNTS.withoutTokens.accountId,
            amount: 1n,
            memo: { kind: "text", type: "string", value: "" },
          },
          balances,
        );

        expect(result.errors).toEqual({});
      });
    });

    describe("erc20 token send", () => {
      it("prices fees through the ContractCall path and completes with no errors", async () => {
        const balances = await api.getBalance(context, MAINNET_TEST_ACCOUNTS.withTokens.accountId);

        const result = await api.validateIntent(
          context,
          {
            intentType: "transaction",
            type: HEDERA_TRANSACTION_MODES.Send,
            asset: { type: "erc20", assetReference: MAINNET_TEST_ACCOUNTS.withTokens.erc20Token },
            sender: MAINNET_TEST_ACCOUNTS.withTokens.accountId,
            recipient: MAINNET_TEST_ACCOUNTS.withoutTokens.accountId,
            amount: 1n,
            memo: { kind: "text", type: "string", value: "" },
          },
          balances,
        );

        expect(result.errors).toEqual({});
        expect(result.estimatedFees).toBeGreaterThan(0n);
      });
    });

    describe("token-associate", () => {
      it("has no errors and amount 0 for an account above the USD minimum", async () => {
        const balances = await api.getBalance(context, MAINNET_TEST_ACCOUNTS.withTokens.accountId);

        const result = await api.validateIntent(
          context,
          {
            intentType: "transaction",
            type: HEDERA_TRANSACTION_MODES.TokenAssociate,
            asset: {
              type: "hts",
              assetReference: MAINNET_TEST_ACCOUNTS.withTokens.notAssociatedToken,
            },
            sender: MAINNET_TEST_ACCOUNTS.withTokens.accountId,
            recipient: "",
            amount: 0n,
            memo: { kind: "text", type: "string", value: "" },
          },
          balances,
        );

        expect(result.errors).toEqual({});
        expect(result.amount).toBe(0n);
      });

      it("adds errors.insufficientAssociateBalance for a pristine (zero-balance) account", async () => {
        const balances = await api.getBalance(context, MAINNET_TEST_ACCOUNTS.pristine.accountId);

        const result = await api.validateIntent(
          context,
          {
            intentType: "transaction",
            type: HEDERA_TRANSACTION_MODES.TokenAssociate,
            asset: {
              type: "hts",
              assetReference: MAINNET_TEST_ACCOUNTS.withTokens.notAssociatedToken,
            },
            sender: MAINNET_TEST_ACCOUNTS.pristine.accountId,
            recipient: "",
            amount: 0n,
            memo: { kind: "text", type: "string", value: "" },
          },
          balances,
        );

        expect(result.errors.insufficientAssociateBalance).toBeInstanceOf(
          HederaInsufficientFundsForAssociation,
        );
      });
    });

    describe("memo", () => {
      it("adds errors.transaction when the memo exceeds the maximum size", async () => {
        const balances = await api.getBalance(
          context,
          MAINNET_TEST_ACCOUNTS.withoutTokens.accountId,
        );

        const result = await api.validateIntent(
          context,
          {
            intentType: "transaction",
            type: HEDERA_TRANSACTION_MODES.Send,
            asset: { type: "native" },
            sender: MAINNET_TEST_ACCOUNTS.withoutTokens.accountId,
            recipient: MAINNET_TEST_ACCOUNTS.withTokens.accountId,
            amount: 100n,
            memo: { kind: "text", type: "string", value: "a".repeat(HEDERA_MAX_MEMO_SIZE + 1) },
          },
          balances,
        );

        expect(result.errors.transaction).toBeInstanceOf(HederaMemoExceededSizeError);
      });
    });

    describe("staking", () => {
      it("flags delegating to the already-delegated node", async () => {
        const [stakes, balances] = await Promise.all([
          api.getStakes(context, MAINNET_TEST_ACCOUNTS.activeStaking.accountId),
          api.getBalance(context, MAINNET_TEST_ACCOUNTS.activeStaking.accountId),
        ]);
        const stakedNodeId = stakes.items[0]?.details?.stakedNodeId;
        invariant(typeof stakedNodeId === "number", "expected an active stake with a node id");

        const result = await api.validateIntent(
          context,
          {
            intentType: "transaction",
            type: HEDERA_TRANSACTION_MODES.Delegate,
            asset: { type: "native" },
            sender: MAINNET_TEST_ACCOUNTS.activeStaking.accountId,
            recipient: "",
            amount: 0n,
            memo: { kind: "text", type: "string", value: "" },
            data: { type: "staking", stakingNodeId: stakedNodeId },
          },
          balances,
        );

        expect(result.errors.stakingNodeId).toBeInstanceOf(HederaRedundantStakingNodeIdError);
      });

      it("flags a node id absent from the live validator list", async () => {
        const balances = await api.getBalance(
          context,
          MAINNET_TEST_ACCOUNTS.withoutTokens.accountId,
        );

        const result = await api.validateIntent(
          context,
          {
            intentType: "transaction",
            type: HEDERA_TRANSACTION_MODES.Delegate,
            asset: { type: "native" },
            sender: MAINNET_TEST_ACCOUNTS.withoutTokens.accountId,
            recipient: "",
            amount: 0n,
            memo: { kind: "text", type: "string", value: "" },
            data: { type: "staking", stakingNodeId: 999999 },
          },
          balances,
        );

        expect(result.errors.stakingNodeId).toBeInstanceOf(HederaInvalidStakingNodeIdError);
      });

      it("flags claiming rewards on an account with none pending", async () => {
        const balances = await api.getBalance(
          context,
          MAINNET_TEST_ACCOUNTS.inactiveStaking.accountId,
        );

        const result = await api.validateIntent(
          context,
          {
            intentType: "transaction",
            type: HEDERA_TRANSACTION_MODES.ClaimRewards,
            asset: { type: "native" },
            sender: MAINNET_TEST_ACCOUNTS.inactiveStaking.accountId,
            recipient: "",
            amount: 0n,
            memo: { kind: "text", type: "string", value: "" },
          },
          balances,
        );

        expect(result.errors.noRewardsToClaim).toBeInstanceOf(HederaNoStakingRewardsError);
      });
    });

    describe("customFees", () => {
      it("uses customFees.value directly, skipping estimation", async () => {
        const customFees: FeeEstimation = { value: 123456n };

        const result = await api.validateIntent(
          context,
          {
            intentType: "transaction",
            type: HEDERA_TRANSACTION_MODES.Send,
            asset: { type: "native" },
            sender: MAINNET_TEST_ACCOUNTS.withoutTokens.accountId,
            recipient: MAINNET_TEST_ACCOUNTS.withTokens.accountId,
            amount: 100n,
            memo: { kind: "text", type: "string", value: "" },
          },
          [],
          { customFees },
        );

        expect(result.estimatedFees).toBe(customFees.value);
      });
    });
  });
});
