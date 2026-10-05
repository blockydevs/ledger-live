import { HederaMirrorNodeResponseError } from "../errors";
import type {
  HederaMirrorAccount,
  HederaMirrorBlock,
  HederaMirrorCoinTransfer,
  HederaMirrorContractCallResult,
  HederaMirrorNetworkFees,
  HederaMirrorNode,
  HederaMirrorToken,
  HederaMirrorTokenTransfer,
  HederaMirrorTransaction,
} from "../types/mirror";
import type {
  RawMirrorAccount,
  RawMirrorBlock,
  RawMirrorCoinTransfer,
  RawMirrorContractCallResult,
  RawMirrorNetworkFees,
  RawMirrorNode,
  RawMirrorToken,
  RawMirrorTokenTransfer,
  RawMirrorTransaction,
} from "../types/mirror.raw";

export function requiredField<T>(value: T | null | undefined, path: string): T {
  if (value === null || value === undefined) {
    throw new HederaMirrorNodeResponseError(
      `Mirror node response is missing required field "${path}"`,
    );
  }
  return value;
}

export function parseMirrorCoinTransfer(
  raw: RawMirrorCoinTransfer,
  path: string,
): HederaMirrorCoinTransfer {
  return {
    account: requiredField(raw.account, `${path}.account`),
    amount: raw.amount,
  };
}

export function parseMirrorTokenTransfer(
  raw: RawMirrorTokenTransfer,
  path: string,
): HederaMirrorTokenTransfer {
  return {
    token_id: requiredField(raw.token_id, `${path}.token_id`),
    account: requiredField(raw.account, `${path}.account`),
    amount: raw.amount,
    ...(raw.is_approval !== undefined && { is_approval: raw.is_approval }),
  };
}

export function parseMirrorTransaction(raw: RawMirrorTransaction): HederaMirrorTransaction {
  const transactionId = requiredField(raw.transaction_id, "transaction.transaction_id");
  const path = `transaction[${transactionId}]`;

  return {
    transaction_id: transactionId,
    transaction_hash: requiredField(raw.transaction_hash, `${path}.transaction_hash`),
    consensus_timestamp: requiredField(raw.consensus_timestamp, `${path}.consensus_timestamp`),
    charged_tx_fee: requiredField(raw.charged_tx_fee, `${path}.charged_tx_fee`),
    nonce: requiredField(raw.nonce, `${path}.nonce`),
    result: requiredField(raw.result, `${path}.result`),
    name: requiredField(raw.name, `${path}.name`),
    entity_id: raw.entity_id ?? null,
    parent_consensus_timestamp: raw.parent_consensus_timestamp ?? null,
    node: raw.node ?? null,
    transfers: (raw.transfers ?? []).map((transfer, index) =>
      parseMirrorCoinTransfer(transfer, `${path}.transfers[${index}]`),
    ),
    token_transfers: (raw.token_transfers ?? []).map((transfer, index) =>
      parseMirrorTokenTransfer(transfer, `${path}.token_transfers[${index}]`),
    ),
    staking_reward_transfers: (raw.staking_reward_transfers ?? []).map((transfer, index) =>
      parseMirrorCoinTransfer(transfer, `${path}.staking_reward_transfers[${index}]`),
    ),
    ...(typeof raw.memo_base64 === "string" && { memo_base64: raw.memo_base64 }),
  };
}

export function parseMirrorAccount(raw: RawMirrorAccount): HederaMirrorAccount {
  const account = requiredField(raw.account, "account.account");
  const path = `account[${account}]`;
  const balance = requiredField(raw.balance, `${path}.balance`);

  return {
    account,
    evm_address: requiredField(raw.evm_address, `${path}.evm_address`),
    max_automatic_token_associations: requiredField(
      raw.max_automatic_token_associations,
      `${path}.max_automatic_token_associations`,
    ),
    staked_node_id: raw.staked_node_id,
    pending_reward: requiredField(raw.pending_reward, `${path}.pending_reward`),
    balance: {
      balance: requiredField(balance.balance, `${path}.balance.balance`),
      timestamp: requiredField(balance.timestamp, `${path}.balance.timestamp`),
      tokens: balance.tokens.map((token, index) => ({
        token_id: requiredField(token.token_id, `${path}.balance.tokens[${index}].token_id`),
        balance: requiredField(token.balance, `${path}.balance.tokens[${index}].balance`),
      })),
    },
  };
}

export function parseMirrorToken(raw: RawMirrorToken): HederaMirrorToken {
  const tokenId = requiredField(raw.token_id, "token.token_id");
  const path = `token[${tokenId}]`;

  return {
    token_id: tokenId,
    balance: raw.balance,
    created_timestamp: requiredField(raw.created_timestamp, `${path}.created_timestamp`),
    decimals: requiredField(raw.decimals, `${path}.decimals`),
    automatic_association: requiredField(
      raw.automatic_association,
      `${path}.automatic_association`,
    ),
    freeze_status: requiredField(raw.freeze_status, `${path}.freeze_status`),
    kyc_status: raw.kyc_status,
  };
}

export function parseMirrorNode(raw: RawMirrorNode): HederaMirrorNode {
  const path = `node[${raw.node_id}]`;

  return {
    node_id: raw.node_id,
    node_account_id: requiredField(raw.node_account_id, `${path}.node_account_id`),
    description: raw.description ?? "",
    min_stake: requiredField(raw.min_stake, `${path}.min_stake`),
    max_stake: requiredField(raw.max_stake, `${path}.max_stake`),
    stake: raw.stake,
    stake_rewarded: requiredField(raw.stake_rewarded, `${path}.stake_rewarded`),
    reward_rate_start: requiredField(raw.reward_rate_start, `${path}.reward_rate_start`),
  };
}

export function parseMirrorBlock(raw: RawMirrorBlock): HederaMirrorBlock {
  const timestamp = requiredField(raw.timestamp, "block.timestamp");

  return {
    timestamp: {
      from: requiredField(timestamp.from, "block.timestamp.from"),
      to: timestamp.to ?? null,
    },
  };
}

export function parseMirrorNetworkFees(raw: RawMirrorNetworkFees): HederaMirrorNetworkFees {
  const fees = requiredField(raw.fees, "fees.fees");

  return {
    fees: fees.map((fee, index) => ({
      gas: requiredField(fee.gas, `fees.fees[${index}].gas`),
      transaction_type: requiredField(fee.transaction_type, `fees.fees[${index}].transaction_type`),
    })),
    timestamp: requiredField(raw.timestamp, "fees.timestamp"),
  };
}

export function parseMirrorContractCallResult(
  raw: RawMirrorContractCallResult,
): HederaMirrorContractCallResult {
  return {
    contract_id: requiredField(raw.contract_id, "contractResult.contract_id"),
    block_hash: requiredField(raw.block_hash, "contractResult.block_hash"),
    block_gas_used: requiredField(raw.block_gas_used, "contractResult.block_gas_used"),
    gas_consumed: raw.gas_consumed ?? null,
    gas_limit: requiredField(raw.gas_limit, "contractResult.gas_limit"),
    gas_used: raw.gas_used ?? null,
    timestamp: requiredField(raw.timestamp, "contractResult.timestamp"),
  };
}
