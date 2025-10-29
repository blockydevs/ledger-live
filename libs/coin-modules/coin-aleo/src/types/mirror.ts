export interface AleoMirrorTransaction {
  transaction_id: string;
  transition_id: string;
  transaction_status: string;
  block_number: number;
  block_timestamp: string;
  function_id: string;
  amount: number;
  sender_address: string;
  recipient_address: string;
  program_id: string;
}

export interface AleoMirrorTransactionsResponse {
  transactions: AleoMirrorTransaction[];
  address: string;
  pagination: {
    limit: number;
    offset: number;
    total_count: number;
    has_next: boolean;
    has_previous: boolean;
  };
}

// export interface HederaMirrorToken {
//   automatic_association: boolean;
//   balance: number;
//   created_timestamp: string;
//   decimals: number;
//   token_id: string;
//   freeze_status: FreezeStatus;
//   kyc_status: KycStatus;
// }

// export interface HederaMirrorAccount {
//   account: string;
//   max_automatic_token_associations: number;
//   balance: {
//     balance: number;
//     timestamp: string;
//     tokens: {
//       token_id: string;
//       balance: number;
//     }[];
//   };
// }

// export interface HederaMirrorAccountTokensResponse {
//   tokens: HederaMirrorToken[];
//   links: {
//     next: string | null;
//   };
// }

// export interface HederaMirrorAccountsResponse {
//   accounts: HederaMirrorAccount[];
//   links: {
//     next: string | null;
//   };
// }
