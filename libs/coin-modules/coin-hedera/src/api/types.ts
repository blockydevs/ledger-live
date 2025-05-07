import { AccountId } from "@hashgraph/sdk";
import BigNumber from "bignumber.js";

export interface HederaAccount {
  accountId: AccountId;
  balance: BigNumber;
}

export interface HederaMirrorTransfer {
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
  transfers: HederaMirrorTransfer[];
  token_transfers: HederaMirrorTokenTransfer[];
  charged_tx_fee: string;
  transaction_hash: string;
  consensus_timestamp: string;
  result: string;
}
