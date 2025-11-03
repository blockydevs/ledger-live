import network from "@ledgerhq/live-network";
import type { LiveNetworkResponse } from "@ledgerhq/live-network/network";
import { AleoMirrorTransaction, AleoMirrorTransactionsResponse } from "../types/mirror";
import { LedgerAPI4xx } from "@ledgerhq/errors";
import { AleoAddAccountError } from "../errors";
// // import { getEnv } from "@ledgerhq/live-env";
// // import { LedgerAPI4xx } from "@ledgerhq/errors";

const fetch = <Result>(path: string) => {
  return network<Result>({
    method: "GET",
    url: `https://api.explorer.provable.com/v2/mainnet${path}`,
  });
};

async function getPublicAccountBalance(address: string): Promise<string> {
  try {
    const res = await fetch<string>(`/programs/program/credits.aleo/mapping/account/${address}`);
    return res.data;
  } catch (error) {
    if (error instanceof LedgerAPI4xx && "status" in error && error.status === 404) {
      throw new AleoAddAccountError();
    }

    throw error;
  }
}

async function getAccountTransactions({
  address,
  limit = 50,
  offset = 0,
  fetchAllPages,
}: {
  address: string;
  limit?: number | undefined;
  offset?: number | undefined;
  fetchAllPages: boolean;
}): Promise<{ transactions: AleoMirrorTransaction[]; nextOffset: string | null }> {
  const transactions: AleoMirrorTransaction[] = [];
  const params = new URLSearchParams({
    limit: limit.toString(),
    offset: offset.toString(),
  });

  const nextOffset: number | null = null;
  const nextUrl: string | null = `/transactions/address/${address}?${params.toString()}`;

  while (nextUrl) {
    const res: LiveNetworkResponse<AleoMirrorTransactionsResponse> = await fetch(nextUrl);
    const newTransactions = res.data.transactions;
    transactions.push(...newTransactions);
    // nextOffset = res.data.pagination.offset + res.data.pagination.limit;

    // stop fetching if pagination mode is used and we reached the limit
    if (!fetchAllPages && transactions.length >= limit) {
      break;
    }
  }

  // ensure we don't exceed the limit in pagination mode
  //   if (!fetchAllPages && transactions.length > limit) {
  //     transactions.splice(limit);
  //   }

  //   // set the next offset only if we have more transactions to fetch
  //   if (!fetchAllPages && nextUrl) {
  //     nextOffset = lastTx?.consensus_timestamp ?? null;
  //   }

  return { transactions, nextOffset };
}

export const apiClient = {
  getPublicAccountBalance,
  getAccountTransactions,
};
