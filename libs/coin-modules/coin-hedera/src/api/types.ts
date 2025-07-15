export interface HederaMirrorAccount {
  account: string;
  max_automatic_token_associations: number;
  balance: {
    balance: number;
    timestamp: string;
    tokens: {
      token_id: string;
      balance: number;
    }[];
  };
}
