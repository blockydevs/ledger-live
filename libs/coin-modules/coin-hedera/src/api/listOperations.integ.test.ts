import { getEnv } from "@ledgerhq/live-env";
import { createApi } from "../api";
import { STAKING_REWARD_ACCOUNT_ID, STAKING_REWARD_HASH_SUFFIX } from "../constants";
import { getSyntheticBlock } from "../logic/utils";
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

  describe("listOperations", () => {
    const rewardPayerAddress = STAKING_REWARD_ACCOUNT_ID;

    it("returns empty array for pristine account", async () => {
      const { items: operations } = await api.listOperations(
        context,
        MAINNET_TEST_ACCOUNTS.pristine.accountId,
        { minHeight: 0, order: "desc" },
      );

      expect(operations).toBeInstanceOf(Array);
      expect(operations.length).toBe(0);
    });

    it("returns operations with valid synthetic block info", async () => {
      const cursor = "1790938300.000000000";
      const { items: ops } = await api.listOperations(
        context,
        MAINNET_TEST_ACCOUNTS.withTokens.accountId,
        {
          minHeight: 0,
          cursor,
          limit: 4,
          order: "asc",
        },
      );

      const expectedSyntheticBlock = getSyntheticBlock(cursor);
      const blockHeights = ops.map(o => o.tx.block.height);

      expect(blockHeights.every(h => h >= expectedSyntheticBlock.blockHeight)).toBe(true);
    });

    it("returns operations for real account with tokens", async () => {
      const cursor = "1790946600.000000000";
      const { items: ops } = await api.listOperations(
        context,
        MAINNET_TEST_ACCOUNTS.withTokens.accountId,
        {
          minHeight: 0,
          cursor,
          limit: 100,
          order: "desc",
        },
      );

      const memoTxHash = "0WrSGDGDWvgoFKiZPnodVEsjA0zNCab7NYnFt3UL8v9/i5oyZika5AxI7I8Phtv7";
      const operationWithMemo = ops.find(op => op.tx.hash === memoTxHash);
      const firstTokenAssociateOperations = ops.find(op => op.type === "ASSOCIATE_TOKEN");
      const firstSendTokenOperation = ops.find(o => o.type === "OUT" && o.asset.type !== "native");

      const hasReceiveHbarOperations = ops.some(o => o.type === "IN" && o.asset.type === "native");
      const hasSendHbarOperations = ops.some(op => op.type === "OUT" && op.asset.type === "native");
      const hasReceiveTokenOperations = ops.some(o => o.type === "IN" && o.asset.type !== "native");
      const hasSendTokenOperations = !!firstSendTokenOperation;
      const hasTokenAssociateOperations = !!firstTokenAssociateOperations;
      const hasFeesOperationForSendToken = ops.some(
        o =>
          o.type === "FEES" &&
          o.asset.type === "native" &&
          o.tx.hash === firstSendTokenOperation?.tx.hash,
      );

      expect(ops).toBeInstanceOf(Array);
      expect(ops.length).toBeGreaterThanOrEqual(2);
      expect(hasReceiveHbarOperations).toBe(true);
      expect(hasSendHbarOperations).toBe(true);
      expect(hasReceiveTokenOperations).toBe(true);
      expect(hasSendTokenOperations).toBe(true);
      expect(hasFeesOperationForSendToken).toBe(false);
      expect(hasTokenAssociateOperations).toBe(true);
      expect(operationWithMemo?.details).toMatchObject({
        ledgerOpType: expect.any(String),
        memo: expect.any(String),
        familyExtra: {
          pagingToken: expect.any(String),
          consensusTimestamp: expect.any(String),
          transactionId: expect.any(String),
        },
      });
      expect(firstTokenAssociateOperations?.details).toMatchObject({
        ledgerOpType: expect.any(String),
        familyExtra: {
          associatedTokenId: expect.any(String),
          pagingToken: expect.any(String),
          consensusTimestamp: expect.any(String),
          transactionId: expect.any(String),
        },
      });
      expect(operationWithMemo?.details).not.toHaveProperty("pagingToken");
      expect(operationWithMemo?.details).not.toHaveProperty("consensusTimestamp");
      // every transfer operation should have a fees payer
      expect(ops.every(op => /^0\.0\.\d+$/.test(op.tx.feesPayer ?? ""))).toBe(true);
    });

    it("serves a second sync from the stored height, neither losing nor duplicating operations", async () => {
      const accountId = MAINNET_TEST_ACCOUNTS.withTokens.accountId;
      const { items: firstSync } = await api.listOperations(context, accountId, {
        minHeight: 0,
        order: "desc",
      });
      const lastFinalizedBlock = await api.lastBlock(context);
      // Resuming from mid-page, not from the newest op, so the second sync has known ops to return.
      const minHeight = firstSync[Math.floor(firstSync.length / 2)].tx.block.height + 1;
      const newestKnownHeight = firstSync[0].tx.block.height;

      const { items: secondSync } = await api.listOperations(context, accountId, {
        minHeight,
        order: "desc",
      });

      const expectedIds = firstSync
        .filter(op => op.tx.block.height >= minHeight)
        .map(op => op.id)
        .sort();
      // Operations newer than the first sync may have landed in the meantime.
      const knownRangeIds = secondSync
        .filter(op => op.tx.block.height <= newestKnownHeight)
        .map(op => op.id)
        .sort();
      expect(firstSync.every(op => op.tx.block.height <= lastFinalizedBlock.height)).toBe(true);
      expect(secondSync.every(op => op.tx.block.height >= minHeight)).toBe(true);
      expect(expectedIds.length).toBeGreaterThan(0);
      expect(knownRangeIds).toEqual(expectedIds);
    });

    it("returns IN/OUT operations for mint and burn of amUSDC", async () => {
      const ownerAccountId = MAINNET_TEST_ACCOUNTS.withTokens.accountIdWithErc20;
      const { items: ops } = await api.listOperations(context, ownerAccountId, {
        minHeight: 0,
        limit: 10,
        cursor: "1749584382.000000000",
        order: "asc",
      });

      const zeroAddress = "0x0000000000000000000000000000000000000000";
      const mintTxHash = "1Ed3RfhFN0VQIyFfUrkljtsV9CzbzYNt3LJqqQyHsbiyKoVbJFhGkZwvqr3k0rYJ";
      const burnTxHash = "45Y5pSeY7ULMqJObvAtOow8AjamVNlG3XGbGLt5UrCP2HOdrQ4PzQfXqFlY4GDwd";

      const mintOperation = ops.find(op => op.tx.hash === mintTxHash);
      const burnOperation = ops.find(op => op.tx.hash === burnTxHash);
      const expectedAsset = {
        type: "erc20",
        assetReference: "0xb7687538c7f4cad022d5e97cc778d0b46457c5db",
        assetOwner: ownerAccountId,
      };

      expect(mintOperation).toMatchObject({
        type: "IN",
        recipients: [ownerAccountId],
        senders: [zeroAddress],
        asset: expectedAsset,
        tx: {
          fees: 30080000n,
          feesPayer: ownerAccountId,
        },
      });
      expect(burnOperation).toMatchObject({
        type: "OUT",
        recipients: [zeroAddress],
        senders: [ownerAccountId],
        asset: expectedAsset,
        tx: {
          fees: 52800000n,
          feesPayer: ownerAccountId,
        },
      });
    });

    it("returns staking operations with correct metadata", async () => {
      const cursor = "1791198000.000000000";
      const { items: ops } = await api.listOperations(
        context,
        MAINNET_TEST_ACCOUNTS.withStakingHistory.accountId,
        { minHeight: 0, cursor, limit: 30, order: "desc" },
      );

      const rewardOp = ops.find(op => op.type === "REWARD");
      const delegateOp = ops.find(op => op.type === "DELEGATE");
      const undelegateOp = ops.find(op => op.type === "UNDELEGATE");
      const redelegateOp = ops.find(op => op.type === "REDELEGATE");

      expect(delegateOp?.value).toBe(BigInt(0));
      expect(delegateOp?.tx.fees).toBeGreaterThan(BigInt(0));
      expect(delegateOp?.details).toMatchObject({
        stakedAmount: expect.any(BigInt),
        familyExtra: { previousStakingNodeId: null, targetStakingNodeId: expect.any(Number) },
      });
      expect(undelegateOp?.value).toBe(BigInt(0));
      expect(undelegateOp?.tx.fees).toBeGreaterThan(BigInt(0));
      expect(undelegateOp?.details).toMatchObject({
        stakedAmount: expect.any(BigInt),
        familyExtra: { previousStakingNodeId: expect.any(Number), targetStakingNodeId: null },
      });
      expect(redelegateOp?.value).toBe(BigInt(0));
      expect(redelegateOp?.tx.fees).toBeGreaterThan(BigInt(0));
      expect(redelegateOp?.details).toMatchObject({
        stakedAmount: expect.any(BigInt),
        familyExtra: {
          previousStakingNodeId: expect.any(Number),
          targetStakingNodeId: expect.any(Number),
        },
      });
      expect(rewardOp?.value).toBeGreaterThan(BigInt(0));
      expect(rewardOp?.tx.fees).toBe(BigInt(0));
      expect(rewardOp?.tx.hash).not.toContain(STAKING_REWARD_HASH_SUFFIX);
      // every staking operation should have a fees payer
      expect(ops.every(op => /^0\.0\.\d+$/.test(op.tx.feesPayer ?? ""))).toBe(true);
    });

    it("returns valid senders and recipients for staking operations", async () => {
      const cursor = "1791198000.000000000";
      const { items: ops } = await api.listOperations(
        context,
        MAINNET_TEST_ACCOUNTS.withStakingHistory.accountId,
        { minHeight: 0, cursor, limit: 30, order: "desc" },
      );

      const delegateHash = "9Rl/IA5+A3+Z/rX88fDsavr6FrwoU2bEaFfTyyHvlXMfe+rdTdYHpPuZDoYv4abl";
      const undelegateHash = "rh502AyLcnwcGU5IBdAOucQyHUNRc1NzPlG2h1fVVkuWqVQ8817+i4IP+mDwtUVw";
      const redelegateHash = "k31VmY4pqBeKvzb+9EVatYH2P/4YqseEBNqQRcq3WPh0b2X0B/7yJ/1+4lAkav6e";

      const delegateOp = ops.find(o => o.type !== "REWARD" && o.tx.hash === delegateHash);
      const undelegateOp = ops.find(o => o.type !== "REWARD" && o.tx.hash === undelegateHash);
      const redelegateOp = ops.find(o => o.type !== "REWARD" && o.tx.hash === redelegateHash);
      const rewardOp = ops.find(o => o.type === "REWARD");

      expect(delegateOp?.senders).toEqual([MAINNET_TEST_ACCOUNTS.withStakingHistory.accountId]);
      expect(delegateOp?.recipients).toEqual(["0.0.21"]);
      expect(undelegateOp?.senders).toEqual([MAINNET_TEST_ACCOUNTS.withStakingHistory.accountId]);
      expect(undelegateOp?.recipients).toEqual(["0.0.29"]);
      expect(redelegateOp?.senders).toEqual([MAINNET_TEST_ACCOUNTS.withStakingHistory.accountId]);
      expect(redelegateOp?.recipients).toEqual(["0.0.8"]);
      expect(rewardOp?.senders).toEqual([rewardPayerAddress]);
      expect(rewardOp?.recipients).toEqual([MAINNET_TEST_ACCOUNTS.withStakingHistory.accountId]);
    });

    it("returns valid stakedAmount, respecting uncommitted balance changes", async () => {
      const { items: ops } = await api.listOperations(
        context,
        MAINNET_TEST_ACCOUNTS.withQuickBalanceChanges.accountId,
        { minHeight: 0, limit: 10, order: "asc" },
      );

      const opDelegate1 = ops[2];
      const opOut1 = ops[3];
      const opUndelegate = ops[4];
      const opOut2 = ops[5];
      const opDelegate2 = ops[6];

      // starting point has known, hardcoded balance
      const expectedBalanceDelegate1 = BigInt(49786295);

      // after undelegate1 we expect stakedAmount to be initial balance reduced by:
      // 1. first DELEGATE fee
      // 2. first OUT value + fee
      const expectedBalanceUndelegate =
        expectedBalanceDelegate1 - opDelegate1.tx.fees - opOut1.value - opOut1.tx.fees;

      // after delegate2 we expect stakedAmount to be undelegate1 balance reduced by:
      // 1. first UNDELEGATE fee
      // 2. second OUT value + fee
      const expectedBalanceDelegate2 =
        expectedBalanceUndelegate - opUndelegate.tx.fees - opOut2.value - opOut2.tx.fees;

      expect(opOut1.type).toBe("OUT");
      expect(opOut2.type).toBe("OUT");
      expect(opDelegate1.type).toBe("DELEGATE");
      expect(opDelegate1.details?.stakedAmount).toBe(expectedBalanceDelegate1);
      expect(opUndelegate.type).toBe("UNDELEGATE");
      expect(opUndelegate.details?.stakedAmount).toBe(expectedBalanceUndelegate);
      expect(opDelegate2.type).toBe("DELEGATE");
      expect(opDelegate2.details?.stakedAmount).toBe(expectedBalanceDelegate2);
    });

    it.each(["desc", "asc"] as const)(
      "returns paginated operations for account with high activity (%s)",
      async order => {
        const minHeight = 0;
        const limit = 10;
        const initialCursor = order === "desc" ? "1790946600.000000000" : undefined;

        const { items: page1, next: pagingToken1 } = await api.listOperations(
          context,
          MAINNET_TEST_ACCOUNTS.withTokens.accountId,
          { minHeight, limit, order, ...(initialCursor ? { cursor: initialCursor } : {}) },
        );

        const { items: page2, next: pagingToken2 } = await api.listOperations(
          context,
          MAINNET_TEST_ACCOUNTS.withTokens.accountId,
          { minHeight, limit, order, ...(pagingToken1 ? { cursor: pagingToken1 } : {}) },
        );

        const firstPage1Timestamp = page1[0]?.tx?.date;
        const firstPage2Timestamp = page2[0]?.tx?.date;
        const lastPage1Timestamp = page1[page1.length - 1]?.tx?.date;
        const lastPage2Timestamp = page2[page2.length - 1]?.tx?.date;
        const page1Hashes = new Set(page1.map(op => op.tx.hash));
        const page2Hashes = new Set(page2.map(op => op.tx.hash));
        const hasOverlap = [...page2Hashes].some(hash => page1Hashes.has(hash));

        // NOTE: this won't be equal to limit, because single Hedera transaction can generate multiple operations
        expect(page1.length).toBeGreaterThanOrEqual(limit);
        expect(page2.length).toBeGreaterThanOrEqual(limit);
        expect(pagingToken1).not.toBeNull();
        expect(pagingToken2).not.toBeNull();
        expect(hasOverlap).toBe(false);
        expect(firstPage1Timestamp).toBeInstanceOf(Date);
        expect(firstPage2Timestamp).toBeInstanceOf(Date);
        expect(lastPage1Timestamp).toBeInstanceOf(Date);
        expect(lastPage2Timestamp).toBeInstanceOf(Date);
        expect(lastPage1Timestamp > firstPage2Timestamp).toBe(order === "desc");
        expect(firstPage1Timestamp < lastPage2Timestamp).toBe(order === "asc");
      },
    );
  });
});
