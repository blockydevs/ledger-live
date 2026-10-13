import { log } from "@ledgerhq/logs";
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
} from "../types";
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

const isNil = (value: unknown): value is null | undefined => value === null || value === undefined;

const logSkipped = (what: string, path: string) =>
  log("coin-hedera", `Skipping mirror node ${what} with no value for "${path}"`);

export function requiredField<T>(value: T | null | undefined, path: string): T {
  if (isNil(value)) {
    throw new HederaMirrorNodeResponseError(`Mirror node response has no value for "${path}"`);
  }

  return value;
}

function normalizeCoinTransfers(
  raw: RawMirrorCoinTransfer[] | undefined,
  path: string,
): HederaMirrorCoinTransfer[] {
  return (raw ?? []).flatMap(transfer => {
    if (isNil(transfer.account)) {
      logSkipped("transfer", `${path}[].account`);
      return [];
    }

    return [{ account: transfer.account, amount: transfer.amount }];
  });
}

function normalizeTokenTransfers(
  raw: RawMirrorTokenTransfer[] | undefined,
): HederaMirrorTokenTransfer[] {
  return (raw ?? []).flatMap(transfer => {
    if (isNil(transfer.token_id)) {
      logSkipped("transfer", "token_transfers[].token_id");
      return [];
    }

    if (isNil(transfer.account)) {
      logSkipped("transfer", "token_transfers[].account");
      return [];
    }

    return [
      {
        token_id: transfer.token_id,
        account: transfer.account,
        amount: transfer.amount,
        ...(transfer.is_approval !== undefined && { is_approval: transfer.is_approval }),
      },
    ];
  });
}

export function normalizeTransaction(raw: RawMirrorTransaction): HederaMirrorTransaction | null {
  const {
    transaction_hash,
    transaction_id,
    consensus_timestamp,
    charged_tx_fee,
    nonce,
    result,
    name,
  } = raw;

  if (
    isNil(transaction_hash) ||
    isNil(transaction_id) ||
    isNil(consensus_timestamp) ||
    isNil(charged_tx_fee) ||
    isNil(nonce) ||
    isNil(result) ||
    isNil(name)
  ) {
    const missing = Object.entries({
      transaction_hash,
      transaction_id,
      consensus_timestamp,
      charged_tx_fee,
      nonce,
      result,
      name,
    })
      .filter(([, value]) => isNil(value))
      .map(([field]) => field);
    logSkipped("transaction", missing.join(", "));
    return null;
  }

  return {
    transaction_hash,
    transaction_id,
    consensus_timestamp,
    charged_tx_fee,
    nonce,
    result,
    name,
    transfers: normalizeCoinTransfers(raw.transfers, "transfers"),
    staking_reward_transfers: normalizeCoinTransfers(
      raw.staking_reward_transfers,
      "staking_reward_transfers",
    ),
    token_transfers: normalizeTokenTransfers(raw.token_transfers),
    parent_consensus_timestamp: raw.parent_consensus_timestamp ?? null,
    entity_id: raw.entity_id ?? null,
    node: raw.node ?? null,
    ...(!isNil(raw.memo_base64) && { memo_base64: raw.memo_base64 }),
  };
}

export function normalizeAccount(raw: RawMirrorAccount, account: string): HederaMirrorAccount {
  const balance = requiredField(raw.balance, "balance");
  const tokens = (balance.tokens ?? []).flatMap(token => {
    if (isNil(token.token_id)) {
      logSkipped("token balance", "balance.tokens[].token_id");
      return [];
    }

    return [{ token_id: token.token_id, balance: token.balance }];
  });

  return {
    account,
    max_automatic_token_associations: raw.max_automatic_token_associations ?? 0,
    staked_node_id: raw.staked_node_id ?? null,
    pending_reward: raw.pending_reward ?? 0,
    evm_address: raw.evm_address ?? null,
    created_timestamp: raw.created_timestamp ?? null,
    balance: {
      balance: requiredField(balance.balance, "balance.balance"),
      timestamp: balance.timestamp ?? null,
      tokens,
    },
  };
}

export function normalizeAccounts(raw: RawMirrorAccount[]): HederaMirrorAccount[] {
  return raw.flatMap(account => {
    if (isNil(account.account)) {
      logSkipped("account", "accounts[].account");
      return [];
    }

    if (isNil(account.balance?.balance)) {
      logSkipped("account", "accounts[].balance.balance");
      return [];
    }

    return [normalizeAccount(account, account.account)];
  });
}

export function normalizeToken(raw: RawMirrorToken): HederaMirrorToken | null {
  if (isNil(raw.token_id)) {
    logSkipped("token", "token_id");
    return null;
  }

  return {
    token_id: raw.token_id,
    balance: raw.balance,
    kyc_status: raw.kyc_status,
    created_timestamp: raw.created_timestamp ?? null,
    decimals: raw.decimals ?? null,
    automatic_association: raw.automatic_association ?? null,
    freeze_status: raw.freeze_status ?? null,
  };
}

export function normalizeNode(raw: RawMirrorNode): HederaMirrorNode | null {
  if (isNil(raw.node_account_id)) {
    logSkipped("node", "node_account_id");
    return null;
  }

  return {
    node_id: raw.node_id,
    node_account_id: raw.node_account_id,
    description: raw.description ?? "",
    min_stake: raw.min_stake ?? 0,
    stake_rewarded: raw.stake_rewarded ?? 0,
    reward_rate_start: raw.reward_rate_start ?? 0,
    max_stake: raw.max_stake ?? null,
    stake: raw.stake ?? null,
  };
}

export function normalizeContractCallResult(
  raw: RawMirrorContractCallResult,
): HederaMirrorContractCallResult {
  return {
    gas_limit: requiredField(raw.gas_limit, "gas_limit"),
    contract_id: raw.contract_id ?? null,
    block_hash: raw.block_hash ?? null,
    block_gas_used: raw.block_gas_used ?? null,
    gas_consumed: raw.gas_consumed ?? null,
    gas_used: raw.gas_used ?? null,
    timestamp: raw.timestamp ?? null,
  };
}

export function normalizeNetworkFees(raw: RawMirrorNetworkFees): HederaMirrorNetworkFees {
  const fees = requiredField(raw.fees, "fees").flatMap(fee => {
    if (isNil(fee.gas)) {
      logSkipped("fee", "fees[].gas");
      return [];
    }

    if (isNil(fee.transaction_type)) {
      logSkipped("fee", "fees[].transaction_type");
      return [];
    }

    return [{ gas: fee.gas, transaction_type: fee.transaction_type }];
  });

  return { fees, timestamp: raw.timestamp ?? null };
}

export function normalizeBlock(raw: RawMirrorBlock): HederaMirrorBlock {
  const timestamp = requiredField(raw.timestamp, "timestamp");

  return {
    timestamp: {
      from: requiredField(timestamp.from, "timestamp.from"),
      to: timestamp.to ?? null,
    },
  };
}
