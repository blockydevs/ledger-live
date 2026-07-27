import {
  encodeAbiParameters,
  encodeEventTopics,
  erc20Abi,
  getAddress,
  zeroAddress,
  type Address,
} from "viem";
import {
  getErcTokenAccountRows,
  getErcTokenTransferRows,
  getLatestEthereumTransactionTimestamp,
  refresh,
  registerErc20Token,
  resetErc20Tokens,
  type FakeErcTokenTransfer,
} from "./hgraphFake";

const TOKEN_CONTRACT_ID = "0.0.5005";
const TOKEN_EVM = "0x1111111111111111111111111111111111111111";

/** Mirrors accountNumToLongZeroEvmAddress in hgraphFake.ts — a plain test fixture builder, not a
 * reimplementation of the decoder under test (that stays exercised only via the module's exports). */
function longZero(num: number): Address {
  return `0x${"0".repeat(24)}${num.toString(16).padStart(16, "0")}` as Address;
}

const ACCOUNT_NUM = 1002;
const ACCOUNT_EVM = longZero(ACCOUNT_NUM);
const OTHER_ACCOUNT_NUM = 2;
const OTHER_ACCOUNT_EVM = longZero(OTHER_ACCOUNT_NUM);

function transferLog(from: Address, to: Address, value: bigint) {
  return {
    address: TOKEN_EVM,
    topics: encodeEventTopics({ abi: erc20Abi, eventName: "Transfer", args: { from, to } }),
    data: encodeAbiParameters([{ type: "uint256" }], [value]),
  };
}

function contractCallTx({
  payerNum,
  consensusTimestamp,
  hash,
}: {
  payerNum: number;
  consensusTimestamp: string;
  hash: string;
}) {
  return {
    transaction_id: `0.0.${payerNum}-1700000000-000000000`,
    transaction_hash: hash,
    consensus_timestamp: consensusTimestamp,
    parent_consensus_timestamp: null,
    entity_id: TOKEN_CONTRACT_ID,
    name: "CONTRACTCALL",
  };
}

/** Routes the fake's fetches to canned mirror-node responses, keyed loosely by URL/method so each
 * test only has to describe the handful of endpoints it actually cares about. */
function mockMirrorNode(routes: {
  transactions?: ReturnType<typeof contractCallTx>[];
  logsByTimestamp?: Record<string, ReturnType<typeof transferLog>[]>;
  contractResults?: { timestamp: string }[];
}): jest.Mock {
  const fetchMock = jest.fn(async (url: string) => {
    if (url.includes("/api/v1/transactions?")) {
      return {
        ok: true,
        json: async () => ({ transactions: routes.transactions ?? [], links: { next: null } }),
      };
    }
    if (url.includes("/results/logs")) {
      const timestamp = new URL(url).searchParams.get("timestamp")?.replace("eq:", "");
      return {
        ok: true,
        json: async () => ({ logs: routes.logsByTimestamp?.[timestamp ?? ""] ?? [] }),
      };
    }
    if (url.includes("/api/v1/contracts/results?")) {
      return { ok: true, json: async () => ({ results: routes.contractResults ?? [] }) };
    }
    if (url.includes("/api/v1/contracts/call")) {
      return {
        ok: true,
        json: async () => ({
          result: "0x00000000000000000000000000000000000000000000000000000000002710",
        }),
      };
    }
    throw new Error(`unmocked mirror-node request: ${url}`);
  });
  jest.spyOn(global, "fetch").mockImplementation(fetchMock as unknown as typeof fetch);
  return fetchMock;
}

describe("hgraphFake", () => {
  beforeEach(() => {
    resetErc20Tokens();
    registerErc20Token(TOKEN_CONTRACT_ID, TOKEN_EVM);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe("erc_token_transfer pagination", () => {
    it("terminates at limit:1 instead of hanging, faithfully reproducing the _gt/desc client bug", async () => {
      const timestamps = ["1753600001.000000000", "1753600002.000000000", "1753600003.000000000"];
      const transactions = timestamps.map((ts, i) =>
        contractCallTx({ payerNum: OTHER_ACCOUNT_NUM, consensusTimestamp: ts, hash: `hash${i}` }),
      );
      const logsByTimestamp = Object.fromEntries(
        timestamps.map(ts => [ts, [transferLog(OTHER_ACCOUNT_EVM, ACCOUNT_EVM, 100n)]]),
      );
      mockMirrorNode({ transactions, logsByTimestamp });

      await refresh();

      // Drives the same loop coin-hedera's getERC20Transfers runs: cursor = null, then cursor =
      // last row of the previous page, until a page comes back empty.
      let cursor: string | null = null;
      const cursorsSeen: (string | null)[] = [cursor];
      const collected: FakeErcTokenTransfer[] = [];
      let iterations = 0;

      while (iterations < 10) {
        iterations += 1;
        const page = getErcTokenTransferRows({
          accountId: String(ACCOUNT_NUM),
          tokenEvmAddresses: [TOKEN_EVM],
          cursor,
          limit: 1,
        });
        if (page.length === 0) break;
        collected.push(...page);
        cursor = page[page.length - 1].consensus_timestamp;
        cursorsSeen.push(cursor);
      }

      expect(iterations).toBeLessThan(10);
      expect(cursorsSeen).toEqual([null, "1753600003000000000"]);
      // Only the single newest transfer ever surfaces: the `_gt` direction is correct for asc but
      // wrong for the client's actual desc order — a real coin-hedera bug, reproduced faithfully.
      expect(collected).toHaveLength(1);
      expect(collected[0].consensus_timestamp).toBe(cursorsSeen[1]);
    });

    it("throws a named error instead of hanging if queried past the page guard", async () => {
      mockMirrorNode({ transactions: [] });
      await refresh();

      for (let i = 0; i < 50; i++) {
        getErcTokenTransferRows({
          accountId: String(ACCOUNT_NUM),
          tokenEvmAddresses: [TOKEN_EVM],
          cursor: null,
          limit: 1,
        });
      }

      expect(() =>
        getErcTokenTransferRows({
          accountId: String(ACCOUNT_NUM),
          tokenEvmAddresses: [TOKEN_EVM],
          cursor: null,
          limit: 1,
        }),
      ).toThrow(/hgraphFake.*erc_token_transfer.*50 pages/);
    });

    it("throws if queried before refresh() ever populated a snapshot", () => {
      expect(() =>
        getErcTokenTransferRows({
          accountId: String(ACCOUNT_NUM),
          tokenEvmAddresses: [TOKEN_EVM],
          cursor: null,
          limit: 10,
        }),
      ).toThrow(/hgraphFake.*erc_token_transfer queried before refresh/);
    });
  });

  describe("long-zero address decoding", () => {
    it("decodes both sides of a transfer between two long-zero accounts", async () => {
      const ts = "1753600010.000000000";
      const tx = contractCallTx({ payerNum: OTHER_ACCOUNT_NUM, consensusTimestamp: ts, hash: "h" });
      mockMirrorNode({
        transactions: [tx],
        logsByTimestamp: { [ts]: [transferLog(OTHER_ACCOUNT_EVM, ACCOUNT_EVM, 250n)] },
      });

      await refresh();
      const rows = getErcTokenTransferRows({
        accountId: String(ACCOUNT_NUM),
        tokenEvmAddresses: [TOKEN_EVM],
        cursor: null,
        limit: 10,
      });

      expect(rows).toHaveLength(1);
      expect(rows[0].sender_account_id).toBe(OTHER_ACCOUNT_NUM);
      expect(rows[0].receiver_account_id).toBe(ACCOUNT_NUM);
      expect(rows[0].sender_evm_address).toBe(OTHER_ACCOUNT_EVM);
      expect(rows[0].receiver_evm_address).toBe(ACCOUNT_EVM);
      expect(rows[0].transfer_type).toBe("transfer");
      expect(rows[0].amount).toBe(250);
      // transaction_hash on the fake row is the anchor transaction's transaction_id, not its
      // mirror-node transaction_hash field (base64 SHA-384, which getContractCallResult can't resolve).
      expect(rows[0].transaction_hash).toBe(tx.transaction_id);
      expect(rows[0].transaction_hash).not.toBe(tx.transaction_hash);
    });

    it("leaves *_account_id null for a non-long-zero (ECDSA-alias) address", async () => {
      const ts = "1753600011.000000000";
      const aliasEvm = getAddress(`0x${"ab".repeat(20)}`); // not long-zero
      mockMirrorNode({
        transactions: [
          contractCallTx({ payerNum: OTHER_ACCOUNT_NUM, consensusTimestamp: ts, hash: "h" }),
        ],
        logsByTimestamp: { [ts]: [transferLog(aliasEvm, ACCOUNT_EVM, 42n)] },
      });

      await refresh();
      const rows = getErcTokenTransferRows({
        accountId: String(ACCOUNT_NUM),
        tokenEvmAddresses: [TOKEN_EVM],
        cursor: null,
        limit: 10,
      });

      expect(rows).toHaveLength(1);
      expect(rows[0].sender_account_id).toBeNull();
      expect(rows[0].sender_evm_address).toBe(aliasEvm.toLowerCase());
      expect(rows[0].receiver_account_id).toBe(ACCOUNT_NUM);
    });
  });

  describe("zero address", () => {
    it("maps a from-zero Transfer to a mint with a null sender", async () => {
      const ts = "1753600020.000000000";
      mockMirrorNode({
        transactions: [
          contractCallTx({ payerNum: OTHER_ACCOUNT_NUM, consensusTimestamp: ts, hash: "h" }),
        ],
        logsByTimestamp: { [ts]: [transferLog(zeroAddress, ACCOUNT_EVM, 1_000_000n)] },
      });

      await refresh();
      const rows = getErcTokenTransferRows({
        accountId: String(ACCOUNT_NUM),
        tokenEvmAddresses: [TOKEN_EVM],
        cursor: null,
        limit: 10,
      });

      expect(rows).toHaveLength(1);
      expect(rows[0].transfer_type).toBe("mint");
      expect(rows[0].sender_account_id).toBeNull();
      expect(rows[0].sender_evm_address).toBeNull();
      expect(rows[0].receiver_account_id).toBe(ACCOUNT_NUM);
    });

    it("maps a to-zero Transfer to a burn with a null receiver", async () => {
      const ts = "1753600030.000000000";
      mockMirrorNode({
        transactions: [
          contractCallTx({ payerNum: ACCOUNT_NUM, consensusTimestamp: ts, hash: "h" }),
        ],
        logsByTimestamp: { [ts]: [transferLog(ACCOUNT_EVM, zeroAddress, 500n)] },
      });

      await refresh();
      const rows = getErcTokenTransferRows({
        accountId: String(ACCOUNT_NUM),
        tokenEvmAddresses: [TOKEN_EVM],
        cursor: null,
        limit: 10,
      });

      expect(rows).toHaveLength(1);
      expect(rows[0].transfer_type).toBe("burn");
      expect(rows[0].receiver_account_id).toBeNull();
      expect(rows[0].receiver_evm_address).toBeNull();
      expect(rows[0].sender_account_id).toBe(ACCOUNT_NUM);
    });
  });

  describe("ethereum_transaction floor / isERC20Delayed invariant", () => {
    it("floors to wall clock when no contract result exists yet (pre-contract scenarios)", async () => {
      jest.useFakeTimers().setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      mockMirrorNode({ contractResults: [] });

      const { consensus_timestamp } = await getLatestEthereumTransactionTimestamp();

      expect(BigInt(consensus_timestamp)).toBe(BigInt(Date.now()) * 1_000_000n);
    });

    it("floors to wall clock (not an older contract result), keeping the isERC20Delayed invariant intact", async () => {
      jest.useFakeTimers().setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      // A contract result from well before "now" must not make the reported timestamp regress
      // below wall clock, or isERC20Delayed could silently drop a just-broadcast transaction.
      mockMirrorNode({ contractResults: [{ timestamp: "1700000000.000000000" }] });

      const { consensus_timestamp } = await getLatestEthereumTransactionTimestamp();

      expect(BigInt(consensus_timestamp)).toBe(BigInt(Date.now()) * 1_000_000n);
    });

    it("takes the latest contract result when it is newer than wall clock", async () => {
      jest.useFakeTimers().setSystemTime(new Date("2020-01-01T00:00:00.000Z"));
      mockMirrorNode({ contractResults: [{ timestamp: "1753600099.000000007" }] });

      const { consensus_timestamp } = await getLatestEthereumTransactionTimestamp();

      expect(consensus_timestamp).toBe("1753600099000000007");
    });
  });

  describe("refresh() failure handling", () => {
    it("still throws the never-initialised guard when refresh() has never succeeded", async () => {
      jest.spyOn(global, "fetch").mockRejectedValue(new Error("connection reset"));
      const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});

      await expect(refresh()).resolves.toBeUndefined(); // swallowed, must not throw

      expect(() =>
        getErcTokenTransferRows({
          accountId: String(ACCOUNT_NUM),
          tokenEvmAddresses: [TOKEN_EVM],
          cursor: null,
          limit: 10,
        }),
      ).toThrow(/hgraphFake.*erc_token_transfer queried before refresh/);
      expect(consoleError).toHaveBeenCalled();
    });

    it("retains the previous snapshot and does not throw when a later refresh() fails transiently", async () => {
      const ts = "1753600040.000000000";
      mockMirrorNode({
        transactions: [
          contractCallTx({ payerNum: OTHER_ACCOUNT_NUM, consensusTimestamp: ts, hash: "h" }),
        ],
        logsByTimestamp: { [ts]: [transferLog(OTHER_ACCOUNT_EVM, ACCOUNT_EVM, 777n)] },
      });
      await refresh();

      const before = getErcTokenTransferRows({
        accountId: String(ACCOUNT_NUM),
        tokenEvmAddresses: [TOKEN_EVM],
        cursor: null,
        limit: 10,
      });
      expect(before).toHaveLength(1);
      expect(before[0].amount).toBe(777);

      jest.spyOn(global, "fetch").mockRejectedValue(new Error("503 from mirror node"));
      const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});

      await expect(refresh()).resolves.toBeUndefined();
      expect(consoleError).toHaveBeenCalled();

      const after = getErcTokenTransferRows({
        accountId: String(ACCOUNT_NUM),
        tokenEvmAddresses: [TOKEN_EVM],
        cursor: null,
        limit: 10,
      });
      expect(after).toEqual(before);
    });
  });

  describe("erc_token_account (live balanceOf)", () => {
    it("returns one row per registered token, reading the same contracts/call endpoint waitForErc20Balance polls", async () => {
      const fetchMock = mockMirrorNode({});

      const rows = await getErcTokenAccountRows({ accountId: String(ACCOUNT_NUM) });

      expect(rows).toHaveLength(1);
      expect(rows[0].token_evm_address).toBe(TOKEN_EVM);
      expect(rows[0].balance).toBe(10_000);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/contracts/call"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});
