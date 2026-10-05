export type RawFreezeStatus = "NOT_APPLICABLE" | "FROZEN" | "UNFROZEN";

export type RawKycStatus = "NOT_APPLICABLE" | "GRANTED" | "REVOKED";

export interface RawMirrorCoinTransfer {
  account: string | null;
  amount: number;
}

export interface RawMirrorTokenTransfer {
  token_id: string | null;
  account: string | null;
  amount: number;
  is_approval?: boolean;
}

export interface RawMirrorTransaction {
  transfers?: RawMirrorCoinTransfer[];
  token_transfers?: RawMirrorTokenTransfer[];
  staking_reward_transfers?: RawMirrorCoinTransfer[];
  charged_tx_fee?: number;
  transaction_hash?: string;
  transaction_id?: string;
  nonce?: number;
  consensus_timestamp?: string;
  parent_consensus_timestamp?: string | null;
  entity_id?: string | null;
  result?: string;
  node?: string | null;
  name?: string;
  memo_base64?: string | null;
}

export interface RawMirrorToken {
  automatic_association: boolean | null;
  balance: number;
  created_timestamp: string | null;
  decimals: number | null;
  token_id: string | null;
  freeze_status: RawFreezeStatus | null;
  kyc_status: RawKycStatus;
}

export interface RawMirrorAccount {
  account: string | null;
  max_automatic_token_associations: number | null;
  staked_node_id: number | null;
  pending_reward?: number;
  evm_address: string | null;
  balance: {
    balance: number | null;
    timestamp: string | null;
    tokens: {
      token_id?: string | null;
      balance?: number;
    }[];
  } | null;
}

export interface RawMirrorLinks {
  next?: string | null;
}

export interface RawMirrorAccountTokensResponse {
  tokens?: RawMirrorToken[];
  links?: RawMirrorLinks;
}

export interface RawMirrorAccountsResponse {
  accounts: RawMirrorAccount[];
  links: RawMirrorLinks;
}

export interface RawMirrorTransactionsResponse {
  transactions?: RawMirrorTransaction[];
  links?: RawMirrorLinks;
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
  contract_id?: string | null;
  block_hash?: string | null;
  block_gas_used?: number | null;
  gas_consumed?: number | null;
  gas_limit?: number;
  gas_used?: number | null;
  timestamp?: string;
}

export interface RawMirrorContractCallEstimate {
  result?: string;
}

export interface RawMirrorNode {
  node_id: number;
  node_account_id: string | null;
  description: string | null;
  max_stake: number | null;
  min_stake: number | null;
  stake: number | null;
  stake_rewarded: number | null;
  reward_rate_start: number | null;
}

export interface RawMirrorNodesResponse {
  nodes: RawMirrorNode[];
  links: RawMirrorLinks;
}
