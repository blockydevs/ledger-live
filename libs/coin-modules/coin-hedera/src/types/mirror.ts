export interface HederaMirrorCoinTransfer {
  account: string;
  amount: number;
}

export interface HederaMirrorTokenTransfer {
  token_id: string;
  account: string;
  amount: number;
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
  balance: number;
  created_timestamp: string | null;
  token_id: string;
}

export interface HederaMirrorAccount {
  account: string;
  max_automatic_token_associations: number;
  staked_node_id: number | null;
  pending_reward: number;
  evm_address: string | null;
  created_timestamp?: string | null;
  balance: {
    balance: number;
    timestamp: string | null;
    tokens: {
      token_id: string;
      balance: number;
    }[];
  };
}

export interface HederaMirrorAccountTokensResponse {
  tokens: HederaMirrorToken[];
  links: {
    next?: string | null;
  };
}

export interface HederaMirrorAccountsResponse {
  accounts: HederaMirrorAccount[];
  links: {
    next?: string | null;
  };
}

export interface HederaMirrorTransactionsResponse {
  transactions: HederaMirrorTransaction[];
  links: {
    next?: string | null;
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
    next?: string | null;
  };
}

export interface HederaMirrorNetworkFees {
  fees: {
    gas: number;
    transaction_type: string;
  }[];
}

export interface HederaMirrorContractCallResult {
  gas_consumed: number | null;
  gas_limit: number;
  gas_used: number | null;
}

export interface HederaMirrorContractCallEstimate {
  result: string;
}

export interface HederaMirrorContractCallBalance {
  result: string;
}

export interface HederaMirrorNode {
  node_id: number;
  node_account_id: string;
  description: string;
  max_stake: number | null;
  min_stake: number;
  stake: number | null;
  stake_rewarded: number;
  reward_rate_start: number;
}

export interface HederaMirrorNodesResponse {
  nodes: HederaMirrorNode[];
  links: {
    next?: string | null;
  };
}
