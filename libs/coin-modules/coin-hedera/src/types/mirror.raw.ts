type RawFreezeStatus = "NOT_APPLICABLE" | "FROZEN" | "UNFROZEN";

type RawKycStatus = "NOT_APPLICABLE" | "GRANTED" | "REVOKED";

export interface RawMirrorLinks {
  next?: string | null;
}

export interface RawMirrorCoinTransfer {
  account: string | null;
  amount: number;
  is_approval?: boolean;
}

export interface RawMirrorTokenTransfer {
  token_id: string | null;
  account: string | null;
  amount: number;
  is_approval?: boolean;
}

export interface RawMirrorTransaction {
  charged_tx_fee?: number;
  consensus_timestamp?: string;
  entity_id?: string | null;
  memo_base64?: string | null;
  name?: string;
  node?: string | null;
  nonce?: number;
  parent_consensus_timestamp?: string | null;
  result?: string;
  staking_reward_transfers?: RawMirrorCoinTransfer[];
  token_transfers?: RawMirrorTokenTransfer[];
  transaction_hash?: string;
  transaction_id?: string;
  transfers?: RawMirrorCoinTransfer[];
}

export interface RawMirrorTransactionsResponse {
  transactions?: RawMirrorTransaction[];
  links?: RawMirrorLinks;
}

export interface RawMirrorToken {
  automatic_association: boolean | null;
  balance: number;
  created_timestamp: string | null;
  decimals: number | null;
  freeze_status: RawFreezeStatus | null;
  kyc_status: RawKycStatus;
  token_id: string | null;
}

export interface RawMirrorAccountTokensResponse {
  tokens?: RawMirrorToken[];
  links?: RawMirrorLinks;
}

export interface RawMirrorAccount {
  account: string | null;
  balance: {
    timestamp: string | null;
    balance: number | null;
    tokens: {
      token_id?: string | null;
      balance: number;
    }[];
  } | null;
  created_timestamp: string | null;
  evm_address: string | null;
  max_automatic_token_associations: number | null;
  pending_reward?: number;
  staked_node_id: number | null;
}

export interface RawMirrorAccountsResponse {
  accounts: RawMirrorAccount[];
  links: RawMirrorLinks;
}

export interface RawMirrorBlock {
  timestamp?: {
    from?: string;
    to?: string | null;
  };
}

export interface RawMirrorBlocksResponse {
  blocks?: RawMirrorBlock[];
  links?: RawMirrorLinks;
}

export interface RawMirrorNetworkFees {
  fees?: {
    gas?: number;
    transaction_type?: string;
  }[];
  timestamp?: string;
}

export interface RawMirrorContractCallResult {
  block_gas_used?: number | null;
  block_hash?: string | null;
  contract_id?: string | null;
  gas_consumed?: number | null;
  gas_limit?: number;
  gas_used?: number | null;
  timestamp?: string;
}

export interface RawMirrorNode {
  description: string | null;
  max_stake: number | null;
  min_stake: number | null;
  node_account_id: string | null;
  node_id: number;
  reward_rate_start: number | null;
  stake: number | null;
  stake_rewarded: number | null;
}

export interface RawMirrorNodesResponse {
  nodes: RawMirrorNode[];
  links: RawMirrorLinks;
}
