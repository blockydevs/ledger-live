import { log } from "@ledgerhq/logs";
import { HederaMirrorNodeResponseError } from "../errors";
import type {
  RawMirrorAccount,
  RawMirrorContractCallResult,
  RawMirrorNode,
  RawMirrorToken,
  RawMirrorTransaction,
} from "../types/mirror.raw";
import {
  normalizeAccount,
  normalizeBlock,
  normalizeContractCallResult,
  normalizeNetworkFees,
  normalizeNode,
  normalizeToken,
  normalizeTransaction,
  requiredField,
} from "./normalize";

jest.mock("@ledgerhq/logs");

const getRawTransaction = (overrides?: Partial<RawMirrorTransaction>): RawMirrorTransaction => ({
  transaction_hash: "hash",
  transaction_id: "0.0.1234-1764932745-835883000",
  consensus_timestamp: "1764932745.835883000",
  charged_tx_fee: 100000,
  nonce: 0,
  result: "SUCCESS",
  name: "CRYPTOTRANSFER",
  transfers: [],
  staking_reward_transfers: [],
  token_transfers: [],
  parent_consensus_timestamp: null,
  entity_id: null,
  node: null,
  memo_base64: null,
  ...overrides,
});

const getRawAccount = (overrides?: Partial<RawMirrorAccount>): RawMirrorAccount => ({
  account: "0.0.12345",
  balance: { timestamp: "1764932745.835883000", balance: 1000, tokens: [] },
  created_timestamp: "1764932745.000000000",
  evm_address: "0x0000000000000000000000000000000000012345",
  max_automatic_token_associations: -1,
  pending_reward: 5,
  staked_node_id: 3,
  ...overrides,
});

const getRawToken = (overrides?: Partial<RawMirrorToken>): RawMirrorToken => ({
  token_id: "0.0.2001",
  balance: 10,
  kyc_status: "NOT_APPLICABLE",
  created_timestamp: "1764932745.000000000",
  decimals: 6,
  automatic_association: true,
  freeze_status: "UNFROZEN",
  ...overrides,
});

const getRawNode = (overrides?: Partial<RawMirrorNode>): RawMirrorNode => ({
  node_id: 0,
  node_account_id: "0.0.3",
  description: "Hedera | 0",
  min_stake: 1000,
  max_stake: 100000,
  stake: 50000,
  stake_rewarded: 30000,
  reward_rate_start: 7,
  ...overrides,
});

const fromJson = (value: object): RawMirrorTransaction => JSON.parse(JSON.stringify(value));

const loggedMessages = () => jest.mocked(log).mock.calls.map(([, message]) => message);

describe("network/normalize", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("requiredField", () => {
    it("returns the value", () => {
      expect(requiredField(0, "path")).toBe(0);
    });

    it.each([null, undefined])("throws on %s and names the path", value => {
      expect(() => requiredField(value, "some.path")).toThrow(
        new HederaMirrorNodeResponseError('Mirror node response has no value for "some.path"'),
      );
    });
  });

  describe("normalizeTransaction", () => {
    it("builds the mirror contract field by field", () => {
      const raw = getRawTransaction({
        parent_consensus_timestamp: "1764932745.000000001",
        entity_id: "0.0.1234",
        node: "0.0.3",
        memo_base64: "bWVtbw==",
        transfers: [{ account: "0.0.1", amount: -5, is_approval: true }],
        staking_reward_transfers: [{ account: "0.0.800", amount: 2 }],
        token_transfers: [
          { token_id: "0.0.2001", account: "0.0.1", amount: 3, is_approval: false },
        ],
      });

      const withUnknownField = { ...raw, high_volume: true };

      expect(normalizeTransaction(withUnknownField)).toEqual({
        transaction_hash: "hash",
        transaction_id: "0.0.1234-1764932745-835883000",
        consensus_timestamp: "1764932745.835883000",
        charged_tx_fee: 100000,
        nonce: 0,
        result: "SUCCESS",
        name: "CRYPTOTRANSFER",
        transfers: [{ account: "0.0.1", amount: -5 }],
        staking_reward_transfers: [{ account: "0.0.800", amount: 2 }],
        token_transfers: [
          { token_id: "0.0.2001", account: "0.0.1", amount: 3, is_approval: false },
        ],
        parent_consensus_timestamp: "1764932745.000000001",
        entity_id: "0.0.1234",
        node: "0.0.3",
        memo_base64: "bWVtbw==",
      });
    });

    it.each([
      "transaction_hash",
      "transaction_id",
      "consensus_timestamp",
      "charged_tx_fee",
      "nonce",
      "result",
      "name",
    ] as const)("returns null and logs when %s is null", field => {
      const raw = fromJson({ ...getRawTransaction(), [field]: null });

      expect(normalizeTransaction(raw)).toBeNull();
      expect(log).toHaveBeenCalledWith(
        "coin-hedera",
        `Skipping mirror node transaction with no value for "${field}"`,
      );
    });

    it.each(["transaction_hash", "name"] as const)("returns null when %s is absent", field => {
      const raw = getRawTransaction();
      delete raw[field];

      expect(normalizeTransaction(raw)).toBeNull();
    });

    it.each(["transfers", "staking_reward_transfers"] as const)(
      "skips %s elements without account and logs",
      field => {
        const raw = getRawTransaction({
          [field]: [
            { account: null, amount: 1 },
            { account: "0.0.1", amount: 2 },
          ],
        });

        expect(normalizeTransaction(raw)?.[field]).toEqual([{ account: "0.0.1", amount: 2 }]);
        expect(loggedMessages()).toEqual([
          `Skipping mirror node transfer with no value for "${field}[].account"`,
        ]);
      },
    );

    it.each([
      ["token_id", { token_id: null, account: "0.0.1", amount: 1 }],
      ["account", { token_id: "0.0.2001", account: null, amount: 1 }],
    ] as const)("skips token_transfers elements without %s and logs", (field, skipped) => {
      const raw = getRawTransaction({
        token_transfers: [skipped, { token_id: "0.0.2001", account: "0.0.1", amount: 2 }],
      });

      expect(normalizeTransaction(raw)?.token_transfers).toEqual([
        { token_id: "0.0.2001", account: "0.0.1", amount: 2 },
      ]);
      expect(loggedMessages()).toEqual([
        `Skipping mirror node transfer with no value for "token_transfers[].${field}"`,
      ]);
    });

    it("turns missing transfer arrays into empty arrays", () => {
      const raw = getRawTransaction();
      delete raw.transfers;
      delete raw.staking_reward_transfers;
      delete raw.token_transfers;

      expect(normalizeTransaction(raw)).toEqual({
        transaction_hash: "hash",
        transaction_id: "0.0.1234-1764932745-835883000",
        consensus_timestamp: "1764932745.835883000",
        charged_tx_fee: 100000,
        nonce: 0,
        result: "SUCCESS",
        name: "CRYPTOTRANSFER",
        transfers: [],
        staking_reward_transfers: [],
        token_transfers: [],
        parent_consensus_timestamp: null,
        entity_id: null,
        node: null,
      });
    });

    it("falls back to null for optional ids and omits an empty memo", () => {
      expect(normalizeTransaction(getRawTransaction())).toEqual({
        transaction_hash: "hash",
        transaction_id: "0.0.1234-1764932745-835883000",
        consensus_timestamp: "1764932745.835883000",
        charged_tx_fee: 100000,
        nonce: 0,
        result: "SUCCESS",
        name: "CRYPTOTRANSFER",
        transfers: [],
        staking_reward_transfers: [],
        token_transfers: [],
        parent_consensus_timestamp: null,
        entity_id: null,
        node: null,
      });
    });

    it("does not put account ids or token ids in the log", () => {
      normalizeTransaction(
        getRawTransaction({
          transfers: [{ account: null, amount: 777 }],
          token_transfers: [{ token_id: "0.0.424242", account: null, amount: 888 }],
        }),
      );

      const logged = loggedMessages().join("\n");
      expect(logged).not.toContain("424242");
      expect(logged).not.toContain("777");
      expect(logged).not.toContain("888");
    });
  });

  describe("normalizeAccount", () => {
    it("builds the mirror contract field by field", () => {
      expect(
        normalizeAccount(
          {
            ...getRawAccount(),
            balance: {
              timestamp: "1764932745.835883000",
              balance: 1000,
              tokens: [{ token_id: "0.0.2001", balance: 10 }],
            },
          },
          "0.0.12345",
        ),
      ).toEqual({
        account: "0.0.12345",
        max_automatic_token_associations: -1,
        staked_node_id: 3,
        pending_reward: 5,
        evm_address: "0x0000000000000000000000000000000000012345",
        created_timestamp: "1764932745.000000000",
        balance: {
          balance: 1000,
          timestamp: "1764932745.835883000",
          tokens: [{ token_id: "0.0.2001", balance: 10 }],
        },
      });
    });

    it("takes the account id from the caller", () => {
      expect(normalizeAccount(getRawAccount({ account: null }), "0.0.777").account).toBe("0.0.777");
    });

    it("throws when balance is null", () => {
      expect(() => normalizeAccount(getRawAccount({ balance: null }), "0.0.12345")).toThrow(
        new HederaMirrorNodeResponseError('Mirror node response has no value for "balance"'),
      );
    });

    it("throws when balance.balance is null", () => {
      expect(() =>
        normalizeAccount(
          getRawAccount({ balance: { timestamp: null, balance: null, tokens: [] } }),
          "0.0.12345",
        ),
      ).toThrow(
        new HederaMirrorNodeResponseError(
          'Mirror node response has no value for "balance.balance"',
        ),
      );
    });

    it("throws when balance.tokens is missing", () => {
      const raw = getRawAccount({ balance: { timestamp: null, balance: 1, tokens: [] } });
      delete (raw.balance as { tokens?: unknown }).tokens;

      expect(() => normalizeAccount(raw, "0.0.12345")).toThrow(
        new HederaMirrorNodeResponseError('Mirror node response has no value for "balance.tokens"'),
      );
    });

    it("falls back to 0 for a missing pending_reward", () => {
      const raw = getRawAccount();
      delete raw.pending_reward;

      expect(normalizeAccount(raw, "0.0.12345").pending_reward).toBe(0);
    });

    it("falls back to 0 for null max_automatic_token_associations", () => {
      expect(
        normalizeAccount(getRawAccount({ max_automatic_token_associations: null }), "0.0.12345")
          .max_automatic_token_associations,
      ).toBe(0);
    });

    it("keeps 0 and -1 for max_automatic_token_associations", () => {
      expect(
        [0, -1].map(
          value =>
            normalizeAccount(
              getRawAccount({ max_automatic_token_associations: value }),
              "0.0.12345",
            ).max_automatic_token_associations,
        ),
      ).toEqual([0, -1]);
    });

    it("skips balance.tokens elements without token_id and logs", () => {
      const raw = getRawAccount({
        balance: {
          timestamp: null,
          balance: 1,
          tokens: [
            { balance: 4 },
            { token_id: null, balance: 5 },
            { token_id: "0.0.2001", balance: 6 },
          ],
        },
      });

      expect(normalizeAccount(raw, "0.0.12345").balance.tokens).toEqual([
        { token_id: "0.0.2001", balance: 6 },
      ]);
      expect(loggedMessages()).toEqual([
        'Skipping mirror node token balance with no value for "balance.tokens[].token_id"',
        'Skipping mirror node token balance with no value for "balance.tokens[].token_id"',
      ]);
    });

    it("falls back to null for evm_address, balance.timestamp, staked_node_id and created_timestamp", () => {
      expect(
        normalizeAccount(
          getRawAccount({
            evm_address: null,
            staked_node_id: null,
            created_timestamp: null,
            balance: { timestamp: null, balance: 1, tokens: [] },
          }),
          "0.0.12345",
        ),
      ).toEqual({
        account: "0.0.12345",
        max_automatic_token_associations: -1,
        pending_reward: 5,
        evm_address: null,
        staked_node_id: null,
        created_timestamp: null,
        balance: { balance: 1, timestamp: null, tokens: [] },
      });
    });

    it("does not put token ids in the log", () => {
      normalizeAccount(
        getRawAccount({
          balance: { timestamp: null, balance: 1, tokens: [{ token_id: null, balance: 424242 }] },
        }),
        "0.0.12345",
      );

      expect(loggedMessages().join("\n")).not.toContain("424242");
    });
  });

  describe("normalizeToken", () => {
    it("builds the mirror contract field by field", () => {
      expect(normalizeToken(getRawToken())).toEqual({
        token_id: "0.0.2001",
        balance: 10,
        kyc_status: "NOT_APPLICABLE",
        created_timestamp: "1764932745.000000000",
        decimals: 6,
        automatic_association: true,
        freeze_status: "UNFROZEN",
      });
    });

    it("returns null and logs when token_id is null", () => {
      expect(normalizeToken(getRawToken({ token_id: null, balance: 424242 }))).toBeNull();
      expect(loggedMessages()).toEqual(['Skipping mirror node token with no value for "token_id"']);
    });

    it("falls back to null for created_timestamp, decimals, automatic_association and freeze_status", () => {
      expect(
        normalizeToken(
          getRawToken({
            created_timestamp: null,
            decimals: null,
            automatic_association: null,
            freeze_status: null,
          }),
        ),
      ).toEqual({
        token_id: "0.0.2001",
        balance: 10,
        kyc_status: "NOT_APPLICABLE",
        created_timestamp: null,
        decimals: null,
        automatic_association: null,
        freeze_status: null,
      });
    });
  });

  describe("normalizeNode", () => {
    it("builds the mirror contract field by field", () => {
      expect(normalizeNode(getRawNode())).toEqual({
        node_id: 0,
        node_account_id: "0.0.3",
        description: "Hedera | 0",
        min_stake: 1000,
        max_stake: 100000,
        stake: 50000,
        stake_rewarded: 30000,
        reward_rate_start: 7,
      });
    });

    it("returns null and logs when node_account_id is null", () => {
      expect(normalizeNode(getRawNode({ node_account_id: null }))).toBeNull();
      expect(loggedMessages()).toEqual([
        'Skipping mirror node node with no value for "node_account_id"',
      ]);
    });

    it("falls back to an empty description", () => {
      expect(normalizeNode(getRawNode({ description: null }))?.description).toBe("");
    });

    it.each(["min_stake", "stake_rewarded", "reward_rate_start"] as const)(
      "falls back to 0 when %s is null",
      field => {
        expect(normalizeNode(getRawNode({ [field]: null }))?.[field]).toBe(0);
      },
    );

    it.each(["max_stake", "stake"] as const)("keeps null when %s is null", field => {
      expect(normalizeNode(getRawNode({ [field]: null }))?.[field]).toBeNull();
    });
  });

  describe("normalizeContractCallResult", () => {
    const raw: RawMirrorContractCallResult = {
      contract_id: "0.0.12345",
      timestamp: "1764932745.835883000",
      block_hash: "0xblockhash",
      block_gas_used: 100000,
      gas_consumed: 50000,
      gas_limit: 100000,
      gas_used: 50000,
    };

    it("builds the mirror contract field by field", () => {
      expect(normalizeContractCallResult(raw)).toEqual(raw);
    });

    it("throws when gas_limit is missing", () => {
      expect(() => normalizeContractCallResult({})).toThrow(
        new HederaMirrorNodeResponseError('Mirror node response has no value for "gas_limit"'),
      );
    });

    it("falls back to null for every other field", () => {
      expect(normalizeContractCallResult({ gas_limit: 1 })).toEqual({
        gas_limit: 1,
        contract_id: null,
        timestamp: null,
        block_hash: null,
        block_gas_used: null,
        gas_consumed: null,
        gas_used: null,
      });
    });
  });

  describe("normalizeNetworkFees", () => {
    it("builds the mirror contract field by field", () => {
      expect(
        normalizeNetworkFees({
          fees: [{ gas: 10, transaction_type: "ContractCall" }],
          timestamp: "1764932745.835883000",
        }),
      ).toEqual({
        fees: [{ gas: 10, transaction_type: "ContractCall" }],
        timestamp: "1764932745.835883000",
      });
    });

    it("throws when fees is missing", () => {
      expect(() => normalizeNetworkFees({})).toThrow(
        new HederaMirrorNodeResponseError('Mirror node response has no value for "fees"'),
      );
    });

    it.each([
      ["gas", { transaction_type: "ContractCall" }],
      ["transaction_type", { gas: 10 }],
    ] as const)("skips fees elements without %s and logs", (field, skipped) => {
      expect(
        normalizeNetworkFees({
          fees: [skipped, { gas: 1, transaction_type: "EthereumTransaction" }],
        }),
      ).toEqual({ fees: [{ gas: 1, transaction_type: "EthereumTransaction" }], timestamp: null });
      expect(loggedMessages()).toEqual([
        `Skipping mirror node fee with no value for "fees[].${field}"`,
      ]);
    });

    it("falls back to null for a missing timestamp", () => {
      expect(normalizeNetworkFees({ fees: [] }).timestamp).toBeNull();
    });
  });

  describe("normalizeBlock", () => {
    it("builds the mirror contract field by field", () => {
      expect(normalizeBlock({ timestamp: { from: "1.000000000", to: "2.000000000" } })).toEqual({
        timestamp: { from: "1.000000000", to: "2.000000000" },
      });
    });

    it.each([
      ["timestamp", {}],
      ["timestamp.from", { timestamp: { to: "2.000000000" } }],
    ])("throws when %s is missing", (path, raw) => {
      expect(() => normalizeBlock(raw)).toThrow(
        new HederaMirrorNodeResponseError(`Mirror node response has no value for "${path}"`),
      );
    });

    it("falls back to null for timestamp.to", () => {
      expect(
        normalizeBlock({ timestamp: { from: "1.000000000", to: null } }).timestamp.to,
      ).toBeNull();
    });
  });
});
