export interface HederaThirdwebTransaction {
  address: `0x${string}`;
  blockHash: `0x${string}`;
  blockNumber: number;
  blockTimestamp: number;
  chainId: string;
  data: string;
  decoded: {
    name: string;
    params: {
      from: `0x${string}`;
      to: `0x${string}`;
      value: string;
    };
    signature: string;
  };
  logIndex: number;
  topics: [string, string, string];
  transactionHash: `0x${string}`;
  transactionIndex: number;
}

export interface HederaThirdwebTransactions {
  result: {
    events: HederaThirdwebTransaction[];
    pagination: HederaThirdwebPagination;
  };
}

export interface HederaThirdwebPagination {
  limit: number;
  page: number;
  totalCount: number;
}
