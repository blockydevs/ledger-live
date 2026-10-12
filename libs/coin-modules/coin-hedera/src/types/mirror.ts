type FreezeStatus = "NOT_APPLICABLE" | "FROZEN" | "UNFROZEN";

type KycStatus = "NOT_APPLICABLE" | "GRANTED" | "REVOKED";

export interface HederaMirrorCoinTransfer {
  account: string | null;
  amount: number;
}

export interface HederaMirrorTokenTransfer {
  token_id: string | null;
  account: string | null;
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
  automatic_association: boolean | null;
  balance: number;
  created_timestamp: string | null;
  decimals: number | null;
  token_id: string | null;
  freeze_status: FreezeStatus | null;
  kyc_status: KycStatus;
}

export interface HederaMirrorAccount {
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
  };
}

export interface HederaMirrorAccountTokensResponse {
  tokens: HederaMirrorToken[];
  links: {
    next: string | null;
  };
}

export interface HederaMirrorAccountsResponse {
  accounts: HederaMirrorAccount[];
  links: {
    next: string | null;
  };
}

export interface HederaMirrorTransactionsResponse {
  transactions: HederaMirrorTransaction[];
  links: {
    next: string | null;
  };
}

export interface HederaMirrorBlock {
  timestamp: {
    from: string;
    to: string | null;
  };
}

export interface HederaMirrorBlocksResponse {
  blocks: HederaMirrorBlock[];
  links: {
    next: string | null;
  };
}

export interface HederaMirrorNetworkFees {
  fees: {
    gas: number;
    transaction_type: "ContractCall" | "ContractCreate" | "EthereumTransaction";
  }[];
  timestamp: string;
}

export interface HederaMirrorContractCallResult {
  contract_id: string | null;
  block_hash: string | null;
  block_gas_used: number | null;
  gas_consumed: number | null;
  gas_limit: number;
  gas_used: number | null;
  timestamp: string;
}

export interface HederaMirrorContractCallEstimate {
  result: string;
}

export interface HederaMirrorContractCallBalance {
  result: string;
}

export interface HederaMirrorNode {
  node_id: number;
  node_account_id: string | null;
  description: string | null;
  max_stake: number | null;
  min_stake: number | null;
  stake: number | null;
  stake_rewarded: number | null;
  reward_rate_start: number | null;
}

export interface HederaMirrorNodesResponse {
  nodes: HederaMirrorNode[];
  links: {
    next: string | null;
  };
}
