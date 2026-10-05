type FreezeStatus = "NOT_APPLICABLE" | "FROZEN" | "UNFROZEN";

type KycStatus = "NOT_APPLICABLE" | "GRANTED" | "REVOKED";

export interface HederaMirrorCoinTransfer {
  account: string;
  amount: number;
}

export interface HederaMirrorTokenTransfer {
  token_id: string;
  account: string;
  amount: number;
  is_approval?: boolean;
}

export interface HederaMirrorTransaction {
  transfers: HederaMirrorCoinTransfer[];
  token_transfers: HederaMirrorTokenTransfer[];
  staking_reward_transfers: HederaMirrorCoinTransfer[];
  charged_tx_fee: number;
  transaction_hash: string;
  transaction_id: string;
  nonce: number;
  consensus_timestamp: string;
  parent_consensus_timestamp: string | null;
  entity_id: string | null;
  result: string;
  node: string | null;
  name: string;
  memo_base64?: string;
}

export interface HederaMirrorToken {
  automatic_association: boolean;
  balance: number;
  created_timestamp: string;
  decimals: number;
  token_id: string;
  freeze_status: FreezeStatus;
  kyc_status: KycStatus;
}

export interface HederaMirrorAccount {
  account: string;
  max_automatic_token_associations: number;
  staked_node_id: number | null;
  pending_reward: number;
  evm_address: string;
  balance: {
    balance: number;
    timestamp: string;
    tokens: {
      token_id: string;
      balance: number;
    }[];
  };
}

export interface HederaMirrorBlock {
  timestamp: {
    from: string;
    to: string | null;
  };
}

export interface HederaMirrorNetworkFees {
  fees: {
    gas: number;
    transaction_type: string;
  }[];
  timestamp: string;
}

export interface HederaMirrorContractCallResult {
  contract_id: string;
  block_hash: string;
  block_gas_used: number;
  gas_consumed: number | null;
  gas_limit: number;
  gas_used: number | null;
  timestamp: string;
}

export interface HederaMirrorNode {
  node_id: number;
  node_account_id: string;
  description: string;
  max_stake: number;
  min_stake: number;
  stake: number | null;
  stake_rewarded: number;
  reward_rate_start: number;
}
