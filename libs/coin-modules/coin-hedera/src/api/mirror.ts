import { AccountId } from "@hashgraph/sdk";
import network from "@ledgerhq/live-network/network";
import BigNumber from "bignumber.js";
import { getEnv } from "@ledgerhq/live-env";
import { getAccountBalance } from "./network";
import type { HederaMirrorAccount, HederaMirrorToken, HederaMirrorTransaction } from "./types";

const getMirrorApiUrl = (): string => getEnv("API_HEDERA_MIRROR");

const fetch = (path: string) => {
  return network({
    method: "GET",
    url: `${getMirrorApiUrl()}${path}`,
  });
};

interface HederaAccount {
  accountId: AccountId;
  balance: BigNumber;
}

export async function getAccountsForPublicKey(publicKey: string): Promise<HederaAccount[]> {
  let r;
  try {
    r = await fetch(`/api/v1/accounts?account.publicKey=${publicKey}&balance=false`);
  } catch (e: any) {
    if (e.name === "LedgerAPI4xx") return [];
    throw e;
  }
  const rawAccounts = r.data.accounts;
  const accounts: HederaAccount[] = [];

  for (const raw of rawAccounts) {
    const accountBalance = await getAccountBalance(raw.account);

    accounts.push({
      accountId: AccountId.fromString(raw.account),
      balance: accountBalance.balance,
    });
  }

  return accounts;
}

export async function getAccount(address: string): Promise<HederaMirrorAccount> {
  const res = await fetch(`/api/v1/accounts/${address}`);
  const account = res.data as HederaMirrorAccount;

  return account;
}

export async function getAccountTransactions(
  address: string,
  since: string | null,
): Promise<HederaMirrorTransaction[]> {
  const transactions: HederaMirrorTransaction[] = [];
  const params = new URLSearchParams({
    "account.id": address,
    order: "desc",
    limit: "100",
  });

  if (since) {
    params.append("timestamp", `gt:${since}`);
  }

  let nextUrl = `/api/v1/transactions?${params.toString()}`;

  while (nextUrl) {
    const res = await fetch(nextUrl);
    const newTransactions = res.data.transactions as HederaMirrorTransaction[];
    if (newTransactions.length === 0) break;
    transactions.push(...newTransactions);
    nextUrl = res.data.links.next;
  }

  return transactions;
}

export async function getAccountTokens(address: string): Promise<HederaMirrorToken[]> {
  const tokens: HederaMirrorToken[] = [];
  const params = new URLSearchParams({
    limit: "100",
  });

  let nextUrl = `/api/v1/accounts/${address}/tokens?${params.toString()}`;

  while (nextUrl) {
    const res = await fetch(nextUrl);
    const newTokens = res.data.tokens as HederaMirrorToken[];
    tokens.push(...newTokens);
    nextUrl = res.data.links.next;
  }

  return tokens;
}
