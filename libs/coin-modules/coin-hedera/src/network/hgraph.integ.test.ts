import BigNumber from "bignumber.js";
import { MAINNET_TEST_ACCOUNTS } from "../test/fixtures/account.fixture";
import { getMockedConfig } from "../test/fixtures/config.fixture";
import { hgraphClient } from "./hgraph";

// MUST keep exactly 9 digits after the dot: hgraph.ts strips the dot to build a nanosecond bigint
const ERC20_TRANSFERS_CURSOR = "1749584382.000000000";

// amUSDC, held by `accountIdWithErc20` — not the same token as fixture `erc20Token`
const AM_USDC_EVM_ADDRESS = "0xb7687538c7f4cad022d5e97cc778d0b46457c5db";

// narrow window holding exactly 4 global ERC20 transfers (the query does not filter by account)
const RANGE_START = "1749789662.000000000";
const RANGE_END = "1749789700.000000000";

// shortly before mainnet launch: every consensus timestamp is strictly after this
const HEDERA_MAINNET_LAUNCH_TIMESTAMP_NS = new BigNumber("1567296000000000000");

// 15 minutes in nanoseconds; measured indexer lag is ~5-7s
const MAX_INDEXER_LAG_NS = new BigNumber(900_000_000_000);

describe("hgraphClient", () => {
  const config = getMockedConfig();

  describe("getLatestIndexedConsensusTimestamp", () => {
    it("returns the latest indexed timestamp", async () => {
      const timestamp = await hgraphClient.getLatestIndexedConsensusTimestamp({
        configOrCurrencyId: config,
      });

      const nowNs = new BigNumber(Date.now()).multipliedBy(1e6);

      expect(timestamp).toBeInstanceOf(BigNumber);
      expect(timestamp.isGreaterThan(HEDERA_MAINNET_LAUNCH_TIMESTAMP_NS)).toBe(true);
      expect(timestamp.isLessThanOrEqualTo(nowNs)).toBe(true);
      expect(timestamp.isGreaterThan(nowNs.minus(MAX_INDEXER_LAG_NS))).toBe(true);
    });
  });

  describe("getERC20Balances", () => {
    it("returns ERC20 balances held by the account", async () => {
      const balances = await hgraphClient.getERC20Balances({
        configOrCurrencyId: config,
        address: MAINNET_TEST_ACCOUNTS.withTokens.accountId,
      });

      const erc20Token = balances.find(
        b => b.token_evm_address === MAINNET_TEST_ACCOUNTS.withTokens.erc20Token,
      );

      expect(balances.length).toBeGreaterThan(0);
      // the association is immutable once created; the balance is a moving target
      expect(erc20Token).toMatchObject({
        token_evm_address: MAINNET_TEST_ACCOUNTS.withTokens.erc20Token,
        balance: expect.any(Number),
      });
    });
  });

  describe("getERC20Transfers", () => {
    it("returns no transfers and performs no request when no token is requested", async () => {
      const transfers = await hgraphClient.getERC20Transfers({
        configOrCurrencyId: config,
        address: MAINNET_TEST_ACCOUNTS.withTokens.accountIdWithErc20,
        tokenEvmAddresses: [],
        fetchAllPages: false,
      });

      expect(transfers).toEqual([]);
    });

    it("returns the pinned first page of amUSDC transfers in ascending order", async () => {
      const transfers = await hgraphClient.getERC20Transfers({
        configOrCurrencyId: config,
        address: MAINNET_TEST_ACCOUNTS.withTokens.accountIdWithErc20,
        tokenEvmAddresses: [AM_USDC_EVM_ADDRESS],
        timestamp: ERC20_TRANSFERS_CURSOR,
        order: "asc",
        limit: 10,
        fetchAllPages: false,
      });

      // keyed on transaction_hash: consensus_timestamp exceeds 2^53, so it can't be compared literally
      expect(transfers).toHaveLength(10);
      expect(transfers.map(t => t.transaction_hash)).toEqual([
        "0xd4477745f84537455023215f52b9258edb15f42cdbcd836ddcb26aa90c87b1b8",
        "0xe39639a52798ed42cca8939bbc0b4ea30f008da9953651b75c66c62ede54ac23",
        "0xb9197ff05bd6a3a3ba80429e9644fc497dfc4ed374cf1fc08ee1a42409d025ba",
        "0x521a48dfcb1998406b54657f9f311b645a9c4361e57682f5234507f7ed0afa70",
        "0x955b4f2c331f0303ac42f2278663b1800a953e008639402efbdac58f50ef016a",
        "0x68e5da74e2f19f9f90a2ee7057bc95cc336a096d38b4ef198de2fd213c55a9c1",
        "0x3071cd15017cd77714c50a02c4b878a77d6d1ae25a6c34f92ccb216be194db71",
        "0x37be2ffbdcb313109e9e97e7ca01c4c6839dd7f5127247064abf214407f30536",
        "0x8ad26e4bee402444aefd03227761e27e1693bcf044867a30b0e4d51033d8584b",
        "0x6bd0bac09ef46bca221eab02082de4de4352dc11a31a5a883eb591f81675a4ae",
      ]);
      expect(transfers[0]).toMatchObject({
        transfer_type: "mint",
        amount: 1097739249,
        token_evm_address: AM_USDC_EVM_ADDRESS,
        token_id: 7308496,
        receiver_account_id: 4351292,
      });
      expect(transfers[1]).toMatchObject({
        transfer_type: "burn",
        amount: 200000000,
        sender_account_id: 4351292,
      });
      expect(transfers.every(t => t.consensus_timestamp > 1749584382000000000)).toBe(true);
      expect(transfers.every(t => t.token_evm_address === AM_USDC_EVM_ADDRESS)).toBe(true);
    });
  });

  describe("getERC20TransfersByTimestampRange", () => {
    it("returns every transfer within the pinned [start, end) window", async () => {
      const transfers = await hgraphClient.getERC20TransfersByTimestampRange({
        configOrCurrencyId: config,
        startTimestamp: RANGE_START,
        endTimestamp: RANGE_END,
      });

      // Two transactions, each contributing a mint leg and a burn leg.
      expect(transfers).toHaveLength(4);
      expect(transfers.map(t => t.transaction_hash)).toEqual([
        "0xeaf02f76af48b10ac5355f340d1e1ac2a78f23136dbf7cbcf59de4d61db28881",
        "0xeaf02f76af48b10ac5355f340d1e1ac2a78f23136dbf7cbcf59de4d61db28881",
        "0xe39639a52798ed42cca8939bbc0b4ea30f008da9953651b75c66c62ede54ac23",
        "0xe39639a52798ed42cca8939bbc0b4ea30f008da9953651b75c66c62ede54ac23",
      ]);
      expect(transfers.map(t => t.transfer_type)).toEqual(["mint", "burn", "mint", "burn"]);
      expect(transfers[3]).toMatchObject({
        transfer_type: "burn",
        amount: 200000000,
        sender_account_id: 4351292,
        receiver_account_id: 0,
        payer_account_id: 4351292,
        token_evm_address: AM_USDC_EVM_ADDRESS,
      });
    });

    it("excludes the end bound and includes the start bound", async () => {
      const transfers = await hgraphClient.getERC20TransfersByTimestampRange({
        configOrCurrencyId: config,
        // start == an existing transfer, end == that same timestamp + 1ns
        startTimestamp: "1749789662.665193837",
        endTimestamp: "1749789662.665193838",
      });

      expect(transfers).toHaveLength(2);
      expect(
        transfers.every(
          t =>
            t.transaction_hash ===
            "0xe39639a52798ed42cca8939bbc0b4ea30f008da9953651b75c66c62ede54ac23",
        ),
      ).toBe(true);
    });
  });
});
