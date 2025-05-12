import { AccountId } from "@hashgraph/sdk";
import network from "@ledgerhq/live-network/network";
import { Operation } from "@ledgerhq/types-live";
import BigNumber from "bignumber.js";
import { getEnv } from "@ledgerhq/live-env";
import { encodeOperationId } from "@ledgerhq/coin-framework/operation";
import { encodeTokenAccountId } from "@ledgerhq/coin-framework/account";
import { findTokenByAddressInCurrency } from "@ledgerhq/cryptoassets";
import { getAccountBalance } from "./network";
import { base64ToUrlSafeBase64 } from "../bridge/utils";
import { HederaAccount, HederaMirrorTransaction } from "./types";
import { parseTransfers } from "./utils";

const getMirrorApiUrl = (): string => getEnv("API_HEDERA_MIRROR");

const fetch = (path: string) => {
  return network({
    method: "GET",
    url: `${getMirrorApiUrl()}${path}`,
  });
};

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

async function getAccountTransactions(
  address: string,
  since: string | null,
): Promise<HederaMirrorTransaction[]> {
  const transactions: HederaMirrorTransaction[] = [];
  const params = new URLSearchParams({
    "account.id": address,
  });

  if (since) {
    params.append("timestamp", `gt:${since}`);
  }

  let nextUrl = `/api/v1/transactions?${params.toString()}`;

  while (nextUrl) {
    const res = await fetch(nextUrl);
    const newTransactions = res.data.transactions as HederaMirrorTransaction[];
    transactions.push(...newTransactions);
    if (newTransactions.length === 0) break;
    nextUrl = res.data.links.next;
  }

  return transactions;
}

export async function getOperationsForAccount(
  ledgerAccountId: string,
  address: string,
  latestOperationTimestamp: string | null,
): Promise<{
  coinOperations: Operation[];
  tokenOperations: Operation[];
}> {
  const rawTransactions = await getAccountTransactions(address, latestOperationTimestamp);
  const coinOperations: Operation[] = [];
  const tokenOperations: Operation[] = [];

  for (const rawTx of rawTransactions) {
    const timestamp = new Date(parseInt(rawTx.consensus_timestamp.split(".")[0], 10) * 1000);
    const hash = base64ToUrlSafeBase64(rawTx.transaction_hash);
    const fee = new BigNumber(rawTx.charged_tx_fee);
    const tokenTransfers = rawTx.token_transfers ?? [];
    const transfers = rawTx.transfers ?? [];
    const hasFailed = rawTx.result !== "SUCCESS";

    if (tokenTransfers.length > 0) {
      const tokenId = rawTx.token_transfers[0].token_id;
      const token = findTokenByAddressInCurrency(tokenId, "hedera");
      if (!token) continue;

      const encodedTokenId = encodeTokenAccountId(ledgerAccountId, token);
      const { type, value, senders, recipients } = parseTransfers(rawTx.token_transfers, address);

      tokenOperations.push({
        id: encodeOperationId(encodedTokenId, hash, type),
        accountId: encodedTokenId,
        type,
        value,
        recipients,
        senders,
        hash,
        fee,
        date: timestamp,
        blockHeight: 5,
        blockHash: null,
        hasFailed,
        extra: { consensusTimestamp: rawTx.consensus_timestamp },
      });
    } else if (transfers.length > 0) {
      const { type, value, senders, recipients } = parseTransfers(rawTx.transfers, address);

      coinOperations.push({
        id: encodeOperationId(ledgerAccountId, hash, type),
        accountId: ledgerAccountId,
        type,
        value,
        recipients,
        senders,
        hash,
        fee,
        date: timestamp,
        blockHeight: 5,
        blockHash: null,
        hasFailed,
        extra: { consensusTimestamp: rawTx.consensus_timestamp },
      });
    }
  }

  return { coinOperations, tokenOperations };
}
