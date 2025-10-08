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
  charged_tx_fee: string;
  transaction_hash: string;
  consensus_timestamp: string;
  result: string;
  name: string;
  memo_base64: string | null;
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
  balance: {
    balance: number;
    timestamp: string;
    tokens: {
      token_id: string;
      balance: number;
    }[];
  };
}

export interface HederaMirrorNode {
  node_id: number;
  node_account_id: string;
  description: string;
  max_stake: number;
  min_stake: number;
  stake: number;
  stake_rewarded: number;
}
