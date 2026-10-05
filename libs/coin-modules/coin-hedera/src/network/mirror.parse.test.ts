import { HederaMirrorNodeResponseError } from "../errors";
import type {
  RawMirrorAccount,
  RawMirrorBlock,
  RawMirrorContractCallResult,
  RawMirrorNetworkFees,
  RawMirrorNode,
  RawMirrorToken,
  RawMirrorTransaction,
} from "../types/mirror.raw";
import {
  parseMirrorAccount,
  parseMirrorBlock,
  parseMirrorContractCallResult,
  parseMirrorNetworkFees,
  parseMirrorNode,
  parseMirrorToken,
  parseMirrorTransaction,
} from "./mirror.parse";

const rawTransaction: RawMirrorTransaction = {
  transaction_id: "0.0.1234-1764932745-835883000",
  transaction_hash: "hash",
  consensus_timestamp: "1764932745.835883000",
  charged_tx_fee: 100000,
  nonce: 0,
  result: "SUCCESS",
  name: "CRYPTOTRANSFER",
  entity_id: "0.0.1234",
  parent_consensus_timestamp: null,
  node: "0.0.3",
  memo_base64: null,
  transfers: [
    { account: "0.0.1234", amount: -100100 },
    { account: "0.0.5678", amount: 100000 },
    { account: "0.0.3", amount: 100 },
  ],
  token_transfers: [{ token_id: "0.0.9999", account: "0.0.1234", amount: 5 }],
  staking_reward_transfers: [{ account: "0.0.1234", amount: 7 }],
};

describe("parseMirrorTransaction", () => {
  it("maps a complete transaction one to one", () => {
    expect(parseMirrorTransaction(rawTransaction)).toEqual({
      transaction_id: "0.0.1234-1764932745-835883000",
      transaction_hash: "hash",
      consensus_timestamp: "1764932745.835883000",
      charged_tx_fee: 100000,
      nonce: 0,
      result: "SUCCESS",
      name: "CRYPTOTRANSFER",
      entity_id: "0.0.1234",
      parent_consensus_timestamp: null,
      node: "0.0.3",
      transfers: [
        { account: "0.0.1234", amount: -100100 },
        { account: "0.0.5678", amount: 100000 },
        { account: "0.0.3", amount: 100 },
      ],
      token_transfers: [{ token_id: "0.0.9999", account: "0.0.1234", amount: 5 }],
      staking_reward_transfers: [{ account: "0.0.1234", amount: 7 }],
    });
  });

  it("omits memo_base64 when null and keeps it when a string", () => {
    expect(parseMirrorTransaction(rawTransaction)).not.toHaveProperty("memo_base64");
    expect(parseMirrorTransaction({ ...rawTransaction, memo_base64: "aGk=" }).memo_base64).toBe(
      "aGk=",
    );
  });

  it("defaults missing transfer arrays to empty arrays", () => {
    const {
      transfers: _transfers,
      token_transfers: _tokenTransfers,
      staking_reward_transfers: _stakingRewardTransfers,
      ...rest
    } = rawTransaction;
    const parsed = parseMirrorTransaction(rest);
    expect(parsed.transfers).toEqual([]);
    expect(parsed.token_transfers).toEqual([]);
    expect(parsed.staking_reward_transfers).toEqual([]);
  });

  it("defaults missing nullable scalars to null", () => {
    const {
      entity_id: _entityId,
      parent_consensus_timestamp: _parentConsensusTimestamp,
      node: _node,
      ...rest
    } = rawTransaction;
    const parsed = parseMirrorTransaction(rest);
    expect(parsed.entity_id).toBeNull();
    expect(parsed.parent_consensus_timestamp).toBeNull();
    expect(parsed.node).toBeNull();
  });

  it("accepts a failed transaction", () => {
    const parsed = parseMirrorTransaction({
      ...rawTransaction,
      result: "INSUFFICIENT_ACCOUNT_BALANCE",
      transfers: [{ account: "0.0.1234", amount: -100 }],
    });
    expect(parsed.result).toBe("INSUFFICIENT_ACCOUNT_BALANCE");
  });

  it.each([
    "transaction_id",
    "transaction_hash",
    "consensus_timestamp",
    "charged_tx_fee",
    "nonce",
    "result",
    "name",
  ] as const)("throws when %s is missing", field => {
    const raw: RawMirrorTransaction = { ...rawTransaction };
    delete raw[field];

    expect(() => parseMirrorTransaction(raw)).toThrow(HederaMirrorNodeResponseError);
    expect(() => parseMirrorTransaction(raw)).toThrow(field);
  });

  it("throws when a coin transfer has no account", () => {
    expect(() =>
      parseMirrorTransaction({ ...rawTransaction, transfers: [{ account: null, amount: 1 }] }),
    ).toThrow("transfers[0].account");
  });

  it("throws when a token transfer has no token id or account", () => {
    expect(() =>
      parseMirrorTransaction({
        ...rawTransaction,
        token_transfers: [{ token_id: null, account: "0.0.1", amount: 1 }],
      }),
    ).toThrow("token_transfers[0].token_id");
    expect(() =>
      parseMirrorTransaction({
        ...rawTransaction,
        token_transfers: [{ token_id: "0.0.9", account: null, amount: 1 }],
      }),
    ).toThrow("token_transfers[0].account");
  });

  it("throws when a staking reward transfer has no account", () => {
    expect(() =>
      parseMirrorTransaction({
        ...rawTransaction,
        staking_reward_transfers: [{ account: null, amount: 1 }],
      }),
    ).toThrow("staking_reward_transfers[0].account");
  });

  it("names the transaction in the error message", () => {
    const { transaction_hash: _transactionHash, ...raw } = rawTransaction;
    expect(() => parseMirrorTransaction(raw)).toThrow("0.0.1234-1764932745-835883000");
  });
});

const rawAccount: RawMirrorAccount = {
  account: "0.0.12345",
  evm_address: "0x0000000000000000000000000000000000012345",
  max_automatic_token_associations: -1,
  staked_node_id: 5,
  pending_reward: 42,
  balance: {
    balance: 1000,
    timestamp: "1764932745.835883000",
    tokens: [{ token_id: "0.0.777", balance: 3 }],
  },
};

describe("parseMirrorAccount", () => {
  it("maps a complete account one to one", () => {
    expect(parseMirrorAccount(rawAccount)).toEqual(rawAccount);
  });

  it.each<[string, Partial<RawMirrorAccount>]>([
    ["account", { account: null }],
    ["evm_address", { evm_address: null }],
    ["max_automatic_token_associations", { max_automatic_token_associations: null }],
  ])("throws when %s is null", (field, override) => {
    expect(() => parseMirrorAccount({ ...rawAccount, ...override })).toThrow(field);
  });

  it("throws when pending_reward is missing", () => {
    const { pending_reward: _pendingReward, ...raw } = rawAccount;
    expect(() => parseMirrorAccount(raw)).toThrow("account[0.0.12345].pending_reward");
  });

  it("throws when the balance snapshot is missing", () => {
    expect(() => parseMirrorAccount({ ...rawAccount, balance: null })).toThrow(
      "account[0.0.12345].balance",
    );
  });

  it("throws when the balance value or timestamp is missing", () => {
    expect(() =>
      parseMirrorAccount({ ...rawAccount, balance: { ...rawAccount.balance!, balance: null } }),
    ).toThrow("balance.balance");
    expect(() =>
      parseMirrorAccount({ ...rawAccount, balance: { ...rawAccount.balance!, timestamp: null } }),
    ).toThrow("balance.timestamp");
  });

  it("throws when a balance token has no token id or balance", () => {
    expect(() =>
      parseMirrorAccount({
        ...rawAccount,
        balance: { ...rawAccount.balance!, tokens: [{ balance: 1 }] },
      }),
    ).toThrow("balance.tokens[0].token_id");
    expect(() =>
      parseMirrorAccount({
        ...rawAccount,
        balance: { ...rawAccount.balance!, tokens: [{ token_id: "0.0.1" }] },
      }),
    ).toThrow("balance.tokens[0].balance");
  });
});

const rawToken: RawMirrorToken = {
  token_id: "0.0.777",
  balance: 3,
  created_timestamp: "1700000000.000000000",
  decimals: 6,
  automatic_association: true,
  freeze_status: "UNFROZEN",
  kyc_status: "NOT_APPLICABLE",
};

describe("parseMirrorToken", () => {
  it("maps a complete token one to one", () => {
    expect(parseMirrorToken(rawToken)).toEqual(rawToken);
  });

  it.each<[string, Partial<RawMirrorToken>]>([
    ["token_id", { token_id: null }],
    ["created_timestamp", { created_timestamp: null }],
    ["decimals", { decimals: null }],
    ["automatic_association", { automatic_association: null }],
    ["freeze_status", { freeze_status: null }],
  ])("throws when %s is null", (field, override) => {
    expect(() => parseMirrorToken({ ...rawToken, ...override })).toThrow(field);
  });
});

const rawNode: RawMirrorNode = {
  node_id: 3,
  node_account_id: "0.0.6",
  description: "Hosted by Ledger | Paris, France",
  min_stake: 1000,
  max_stake: 100000,
  stake: null,
  stake_rewarded: 30000,
  reward_rate_start: 3538,
};

describe("parseMirrorNode", () => {
  it("maps a complete node one to one and keeps stake null", () => {
    expect(parseMirrorNode(rawNode)).toEqual(rawNode);
  });

  it("defaults a null description to an empty string", () => {
    expect(parseMirrorNode({ ...rawNode, description: null }).description).toBe("");
  });

  it.each<[string, Partial<RawMirrorNode>]>([
    ["node_account_id", { node_account_id: null }],
    ["min_stake", { min_stake: null }],
    ["max_stake", { max_stake: null }],
    ["stake_rewarded", { stake_rewarded: null }],
    ["reward_rate_start", { reward_rate_start: null }],
  ])("throws when %s is null", (field, override) => {
    expect(() => parseMirrorNode({ ...rawNode, ...override })).toThrow(`node[3].${field}`);
  });
});

describe("parseMirrorBlock", () => {
  it("maps from and to, defaulting a missing to to null", () => {
    const raw: RawMirrorBlock = { timestamp: { from: "1.000000000", to: "2.000000000" } };
    expect(parseMirrorBlock(raw)).toEqual({
      timestamp: { from: "1.000000000", to: "2.000000000" },
    });
    expect(parseMirrorBlock({ timestamp: { from: "1.000000000" } })).toEqual({
      timestamp: { from: "1.000000000", to: null },
    });
  });

  it("throws when timestamp or from is missing", () => {
    expect(() => parseMirrorBlock({})).toThrow('"block.timestamp"');
    expect(() => parseMirrorBlock({ timestamp: {} })).toThrow('"block.timestamp.from"');
  });
});

describe("parseMirrorNetworkFees", () => {
  const raw: RawMirrorNetworkFees = {
    fees: [{ gas: 39, transaction_type: "ContractCall" }],
    timestamp: "1758733200.632122898",
  };

  it("maps a complete fee schedule one to one", () => {
    expect(parseMirrorNetworkFees(raw)).toEqual(raw);
  });

  it("throws when fees, timestamp, gas or transaction_type is missing", () => {
    expect(() => parseMirrorNetworkFees({ timestamp: "1" })).toThrow('"fees.fees"');
    expect(() => parseMirrorNetworkFees({ fees: [] })).toThrow('"fees.timestamp"');
    expect(() =>
      parseMirrorNetworkFees({ ...raw, fees: [{ transaction_type: "ContractCall" }] }),
    ).toThrow("fees.fees[0].gas");
    expect(() => parseMirrorNetworkFees({ ...raw, fees: [{ gas: 1 }] })).toThrow(
      "fees.fees[0].transaction_type",
    );
  });
});

describe("parseMirrorContractCallResult", () => {
  const raw: RawMirrorContractCallResult = {
    contract_id: "0.0.4321",
    block_hash: "0xabc",
    block_gas_used: 100,
    gas_consumed: 200,
    gas_limit: 10000,
    gas_used: 150,
    timestamp: "1758733200.632122898",
  };

  it("maps a complete result one to one", () => {
    expect(parseMirrorContractCallResult(raw)).toEqual(raw);
  });

  it("keeps null gas_consumed and maps a missing gas_used to null", () => {
    const { gas_used: _gasUsed, ...withoutGasUsed } = raw;
    const parsed = parseMirrorContractCallResult({ ...withoutGasUsed, gas_consumed: null });
    expect(parsed.gas_consumed).toBeNull();
    expect(parsed.gas_used).toBeNull();
  });

  it.each(["contract_id", "block_hash", "block_gas_used", "gas_limit", "timestamp"] as const)(
    "throws when %s is missing",
    field => {
      const copy: RawMirrorContractCallResult = { ...raw };
      delete copy[field];
      expect(() => parseMirrorContractCallResult(copy)).toThrow(`contractResult.${field}`);
    },
  );
});
