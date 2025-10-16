import { pad } from "viem";
import { getEnv } from "@ledgerhq/live-env";
import network from "@ledgerhq/live-network/network";
import { TRANSFER_EVENT_SIGNATURE } from "../constants";
import { toEVMAddress } from "../logic";
import type { HederaThirdwebTransaction, HederaThirdwebPagination } from "./thirdweb-types";

const LIMIT = 1000;
const HEDERA_MAINNET_CHAIN_ID = 295;
const API_URL = getEnv("API_HEDERA_THIRDWEB_URL");
const API_KEY = getEnv("API_HEDERA_THIRDWEB_KEY");

export async function fetchERC20Transactions(
  contractAddress: string,
  params: URLSearchParams,
): Promise<HederaThirdwebTransaction[]> {
  const transactions: HederaThirdwebTransaction[] = [];
  let page = 1;
  let totalCount = Infinity;

  while (LIMIT <= totalCount) {
    params.set("page", page.toString());
    const response = await network({
      method: "GET",
      headers: {
        "x-client-id": API_KEY,
      },
      url: `${API_URL}/v1/contracts/${HEDERA_MAINNET_CHAIN_ID}/${contractAddress}/events?${params.toString()}`,
    });
    const newTransactions = response.data.result.events;
    const pagination = response.data.result.pagination as HederaThirdwebPagination;

    totalCount = pagination.totalCount;
    transactions.push(...newTransactions);
    page++;
  }

  return transactions;
}

export async function getAccountERC20Transactions({
  address,
  tokens,
  transactionFetcher = fetchERC20Transactions,
  since,
}: {
  address: string;
  tokens: string[];
  since?: string | null;
  transactionFetcher?: typeof fetchERC20Transactions; // optional dependency injection for testing
}): Promise<HederaThirdwebTransaction[]> {
  const allTransactions: HederaThirdwebTransaction[] = [];
  const evmAddress = toEVMAddress(address);

  if (tokens.length === 0) {
    return allTransactions;
  }

  if (!evmAddress) {
    return allTransactions;
  }

  const baseParams = {
    filterTopic0: TRANSFER_EVENT_SIGNATURE,
    limit: LIMIT.toString(),
    ...(since && { filterBlockTimestampGte: since }),
  } as const;

  for (const contractAddress of tokens) {
    // OUT transactions
    const outParams = new URLSearchParams({ ...baseParams, filterTopic1: pad(evmAddress) });
    const outgoingTxs = await transactionFetcher(contractAddress, outParams);

    // IN transactions
    const inParams = new URLSearchParams({ ...baseParams, filterTopic2: pad(evmAddress) });
    const incomingTxs = await transactionFetcher(contractAddress, inParams);

    allTransactions.push(...outgoingTxs, ...incomingTxs);
  }

  return allTransactions;
}
