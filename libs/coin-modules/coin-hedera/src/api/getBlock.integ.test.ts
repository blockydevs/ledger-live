import { getEnv } from "@ledgerhq/live-env";
import { createApi } from "../api";
import { HEDERA_DUMMY_ADDRESS } from "../constants";
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

  describe("getBlock", () => {
    it("returns block when ERC20 transfers require pagination", async () => {
      const blockHeight = 178347043;

      const block = await api.getBlock(context, blockHeight);

      expect(block.info.height).toBe(blockHeight);
      expect(block.info.hash?.length).toBe(64);
      expect(block.transactions.length).toBeGreaterThan(0);
    });

    it("returns block with proper multi-transfer data", async () => {
      const blockHeight = 179120098;
      const multiTransferTxHash =
        "1zz5Mnd+IFt9HuqNDzOvqEAxpEw0lISQfZNUOXaNwlihjLDIVPcavzMRrE8y4Fnw";
      const sender = MAINNET_TEST_ACCOUNTS.withTokens.accountId;
      const firstRecipient = MAINNET_TEST_ACCOUNTS.inactiveStaking.accountId;
      const secondRecipient = MAINNET_TEST_ACCOUNTS.activeStaking.accountId;

      const expectedCoinTransferTx = {
        hash: multiTransferTxHash,
        failed: false,
        fees: 49735613n,
        feesPayer: sender,
        operations: [
          {
            type: "transfer",
            address: "0.0.802",
            asset: {
              type: "native",
            },
            amount: 49735613n,
          },
          {
            type: "transfer",
            address: firstRecipient,
            asset: {
              type: "native",
            },
            amount: 1000000n,
          },
          {
            type: "transfer",
            address: secondRecipient,
            asset: {
              type: "native",
            },
            amount: 1000000n,
          },
          {
            type: "transfer",
            address: sender,
            asset: {
              type: "native",
            },
            amount: -2000000n, // -51735613n + 49735613n fee
          },
          {
            type: "transfer",
            address: firstRecipient,
            asset: {
              type: "hts",
              assetReference: "0.0.456858",
            },
            amount: 10000n,
          },
          {
            type: "transfer",
            address: sender,
            asset: {
              type: "hts",
              assetReference: "0.0.456858",
            },
            amount: -10000n,
          },
          {
            type: "transfer",
            address: firstRecipient,
            asset: {
              type: "hts",
              assetReference: "0.0.5022567",
            },
            amount: 1n,
          },
          {
            type: "transfer",
            address: secondRecipient,
            asset: {
              type: "hts",
              assetReference: "0.0.5022567",
            },
            amount: 1n,
          },
          {
            type: "transfer",
            address: sender,
            asset: {
              type: "hts",
              assetReference: "0.0.5022567",
            },
            amount: -2n,
          },
        ],
      };

      const block = await api.getBlock(context, blockHeight);
      const resultCoinTransferTx = block.transactions.find(tx => tx.hash === multiTransferTxHash);

      expect(block.info.height).toBe(blockHeight);
      expect(block.info.hash?.length).toBe(64);
      expect(block.info.time).toBeInstanceOf(Date);
      expect(block.info.time?.getTime()).toBeGreaterThan(0);
      expect(resultCoinTransferTx).toMatchObject(expectedCoinTransferTx);
      expect(block.transactions).toBeInstanceOf(Array);
      expect(block.transactions.length).toEqual(36);
      block.transactions.forEach(tx => {
        expect(tx.hash.length).toBe(64);
        expect(tx.fees).toBeGreaterThanOrEqual(0n);
      });
    });

    it("returns block with transaction memo", async () => {
      const blockHeight = 179120100;
      const txHash = "kpaDSRPsp/rCdd8v2BPjdODGqbF+bQNNK7ksPXQf/ikPvIvi1BqP+SCmwZpC0dM6";

      const block = await api.getBlock(context, blockHeight);
      const transaction = block.transactions.find(tx => tx.hash === txHash);

      expect(transaction?.details?.memo).toBe("test");
    });

    it("derives fees payer from transfers for failed transactions", async () => {
      const txPaidBySender = "izXITPe0hCVSrQQFLE2hfZ6Jh5+eOysPOSsxnPLhbuosLCF08mumxdqpl0czaqEt";
      const txNotPaidBySender = "MRVWsnabB52sDUrpIWKLBKWul6lJzBoDjmCynsf97zqqt8a4Z+3GI3Viz6+JBUEk";

      const [paidBySenderBlock, notPaidBySenderBlock] = await Promise.all([
        api.getBlock(context, 179120096),
        api.getBlock(context, 179120135),
      ]);
      const firstTx = paidBySenderBlock.transactions.find(tx => tx.hash === txPaidBySender);
      const secondTx = notPaidBySenderBlock.transactions.find(tx => tx.hash === txNotPaidBySender);

      expect(firstTx?.failed).toBe(true);
      expect(firstTx?.feesPayer).toBe(MAINNET_TEST_ACCOUNTS.withFailedTransactions.accountId);

      expect(secondTx?.failed).toBe(true);
      expect(secondTx?.feesPayer).toBe("0.0.4");
    });

    it("correctly identifies erc20 operations in blocks", async () => {
      const blockHeight = 179120099;
      const txHash = "LsBFNrtAWaJc5ksyXUWUK41pQ0wG98sEY/H11NEvUV6VgaN7gLyCivxXlmh4n+/G";
      const sender = MAINNET_TEST_ACCOUNTS.withTokens.accountId;

      const block = await api.getBlock(context, blockHeight);
      const transaction = block.transactions.find(tx => tx.hash === txHash);

      expect(transaction?.fees).toBe(BigInt(4218572));
      expect(transaction?.operations).toEqual(
        expect.arrayContaining([
          {
            type: "transfer",
            address: "0.0.802",
            asset: {
              type: "native",
            },
            amount: 4218572n,
          },
          {
            type: "transfer",
            address: sender,
            asset: {
              type: "native",
            },
            amount: 0n,
          },
          {
            type: "transfer",
            address: MAINNET_TEST_ACCOUNTS.inactiveStaking.evmAddress,
            asset: {
              type: "erc20",
              assetReference: "0xca367694cdac8f152e33683bb36cc9d6a73f1ef2",
            },
            amount: 7770000000000n,
          },
          {
            type: "transfer",
            address: sender,
            asset: {
              type: "erc20",
              assetReference: "0xca367694cdac8f152e33683bb36cc9d6a73f1ef2",
            },
            amount: -7770000000000n,
          },
        ]),
      );
    });

    it("correctly identifies staking operations in blocks", async () => {
      const [delegateBlock, undelegateBlock, redelegateBlock, rewardsBlock] = await Promise.all([
        api.getBlock(context, 179119797),
        api.getBlock(context, 179119788),
        api.getBlock(context, 179119779),
        api.getBlock(context, 179119560),
      ]);

      const delegateOperations = delegateBlock.transactions
        .flatMap(tx => tx.operations)
        .filter(op => op.type === "other");
      const undelegateOperations = undelegateBlock.transactions
        .flatMap(tx => tx.operations)
        .filter(op => op.type === "other");
      const redelegateOperations = redelegateBlock.transactions
        .flatMap(tx => tx.operations)
        .filter(op => op.type === "other");
      const rewardsTransaction = rewardsBlock.transactions.find(
        tx => tx.hash === "FcaL6dx/etyLe/wfT5vhRnGfFJ2b6OM/q5k8Zlhhs7WPh4A1Q/PoQGjKhW3Zq/Jd",
      );
      const rewardsAccount = MAINNET_TEST_ACCOUNTS.activeStaking.accountId;

      expect(delegateOperations).toEqual([
        {
          type: "other",
          ledgerOpType: "DELEGATE",
          targetStakingNodeId: 19,
          previousStakingNodeId: null,
          stakedAmount: BigInt(499315430),
        },
      ]);
      expect(undelegateOperations).toEqual([
        {
          type: "other",
          ledgerOpType: "UNDELEGATE",
          targetStakingNodeId: null,
          previousStakingNodeId: 11,
          stakedAmount: BigInt(499528329),
        },
      ]);
      expect(redelegateOperations).toEqual([
        {
          type: "other",
          ledgerOpType: "REDELEGATE",
          targetStakingNodeId: 11,
          previousStakingNodeId: 1,
          stakedAmount: BigInt(499741228),
        },
      ]);
      expect(rewardsTransaction?.operations).toEqual(
        expect.arrayContaining([
          {
            type: "transfer",
            address: "0.0.800",
            asset: {
              type: "native",
            },
            amount: -101800n,
          },
          {
            type: "transfer",
            address: "0.0.802",
            asset: {
              type: "native",
            },
            amount: 96772n,
          },
          {
            type: "transfer",
            address: HEDERA_DUMMY_ADDRESS,
            asset: {
              type: "native",
            },
            amount: 1n,
          },
          {
            type: "transfer",
            address: rewardsAccount,
            asset: {
              type: "native",
            },
            amount: -1n, // excluded fee and staking reward
          },
          {
            type: "transfer",
            address: rewardsAccount,
            asset: {
              type: "native",
            },
            amount: 101800n,
          },
        ]),
      );
    });

    it("returns block for latest finalized height from lastBlock", async () => {
      const latestBlockInfo = await api.lastBlock(context);
      const block = await api.getBlock(context, latestBlockInfo.height);

      expect(block.info.height).toBe(latestBlockInfo.height);
      expect(block.info.hash).toBe(latestBlockInfo.hash);
      // Note: lastBlock().time is the transaction timestamp, while getBlock().info.time is the block start time
      expect(block.info.time).toBeInstanceOf(Date);
      expect(block.transactions).toBeInstanceOf(Array);
    });

    it("returns single transaction for multiple erc20 transfers", async () => {
      const data = await api.getBlock(context, 177314999);

      const erc20Asset = {
        type: "erc20",
        assetReference: "0xb7687538c7f4cad022d5e97cc778d0b46457c5db",
      };
      const erc20TxHash = "givnas3WAL3fiGeap+oSRIYOqUbqE0Ig2XIMTWgTDQzTMc8g7aOC1vxc8hQy7wZX";
      const filteredTransactions = data.transactions.filter(tx => tx.hash === erc20TxHash);

      expect(filteredTransactions).toEqual([
        expect.objectContaining({
          operations: [
            {
              type: "transfer",
              address: "0.0.802",
              asset: {
                type: "native",
              },
              amount: 26596592n,
            },
            {
              type: "transfer",
              address: "0.0.10067136",
              asset: {
                type: "native",
              },
              amount: 0n,
            },
            {
              type: "transfer",
              address: "0.0.6145236",
              asset: erc20Asset,
              amount: 2863838n,
            },
            {
              type: "transfer",
              address: "0x0000000000000000000000000000000000000000",
              asset: erc20Asset,
              amount: -2863838n,
            },
            {
              type: "transfer",
              address: "0.0.10067136",
              asset: erc20Asset,
              amount: 148440n,
            },
            {
              type: "transfer",
              address: "0x0000000000000000000000000000000000000000",
              asset: erc20Asset,
              amount: -148440n,
            },
          ],
          fees: 26596592n,
          feesPayer: "0.0.10067136",
        }),
      ]);
    });

    it("filters out ERC20 operations with null sender or recipient address", async () => {
      const blockHeight = 177564534;
      const txHashWithNullAddress =
        "tSFV6McHlh0v6tZEZVGlwavk/QRoMabPIOtVbyJ1/j3gvTHMZP97URu4Vw6JbMmC";

      const block = await api.getBlock(context, blockHeight);
      const transaction = block.transactions.find(tx => tx.hash === txHashWithNullAddress);
      const operationAddresses = transaction?.operations.map(op => op.address);

      expect(transaction).not.toBeUndefined();
      expect(transaction?.operations.length).toBeGreaterThan(0);
      expect(operationAddresses).not.toContain(null);
    });
  });

  describe("lastBlock", () => {
    it("returns the last block information", async () => {
      const lastBlock = await api.lastBlock(context);

      expect(lastBlock.height).toBeGreaterThan(0);
      expect(lastBlock.hash?.length).toBe(64);

      const oneDayMs = 24 * 60 * 60 * 1000;
      expect(lastBlock.time?.getTime()).toBeGreaterThan(Date.now() - oneDayMs);
      expect(lastBlock.time?.getTime()).toBeLessThanOrEqual(Date.now());
    });
  });
});
