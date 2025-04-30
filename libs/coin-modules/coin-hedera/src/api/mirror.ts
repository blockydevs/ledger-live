import { AccountId } from "@hashgraph/sdk";
import network from "@ledgerhq/live-network/network";
import { Operation, OperationType } from "@ledgerhq/types-live";
import BigNumber from "bignumber.js";
import { getEnv } from "@ledgerhq/live-env";
import { encodeOperationId } from "@ledgerhq/coin-framework/operation";
import { getAccountBalance } from "./network";
import { base64ToUrlSafeBase64 } from "../bridge/utils";
import { encodeTokenAccountId } from "@ledgerhq/coin-framework/account";
import { findTokenByAddressInCurrency } from "@ledgerhq/cryptoassets";

const getMirrorApiUrl = (): string => getEnv("API_HEDERA_MIRROR");

const fetch = (path: string) => {
  return network({
    method: "GET",
    url: `${getMirrorApiUrl()}${path}`,
  });
};

export interface Account {
  accountId: AccountId;
  balance: BigNumber;
}

export async function getAccountsForPublicKey(publicKey: string): Promise<Account[]> {
  let r;
  try {
    r = await fetch(`/api/v1/accounts?account.publicKey=${publicKey}&balance=false`);
  } catch (e: any) {
    if (e.name === "LedgerAPI4xx") return [];
    throw e;
  }
  const rawAccounts = r.data.accounts;
  const accounts: Account[] = [];

  for (const raw of rawAccounts) {
    const accountBalance = await getAccountBalance(raw.account);

    accounts.push({
      accountId: AccountId.fromString(raw.account),
      balance: accountBalance.balance,
    });
  }

  return accounts;
}

interface HederaMirrorTransaction {
  transfers: HederaMirrorTransfer[];
  token_transfers: HederaMirrorTokenTransfer[];
  charged_tx_fee: string;
  transaction_hash: string;
  consensus_timestamp: string;
}

interface HederaMirrorTransfer {
  account: string;
  amount: number;
}

// FIXME: verify if ok
interface HederaMirrorTokenTransfer {
  token_id: string;
  account: string;
  amount: number;
  is_approval: boolean;
}

async function getAccountTransactions(
  address: string,
  since: string,
): Promise<HederaMirrorTransaction[]> {
  const transactions: HederaMirrorTransaction[] = [];
  let nextUrl = `/api/v1/transactions?account.id=${address}&timestamp=gt:${since}`;

  while (nextUrl) {
    const res = await fetch(nextUrl);
    const newTransactions = res.data.transactions as HederaMirrorTransaction[];
    transactions.push(...newTransactions);
    nextUrl = res.data.links.next;
  }

  return transactions;
}

// FIXME: maybe other types would be useful too
// FIXME: move to utils or something
function parseTransfers(
  transfers: (HederaMirrorTransfer | HederaMirrorTokenTransfer)[],
  address: string,
): Pick<Operation, "type" | "value" | "senders" | "recipients"> {
  let value = new BigNumber(0);
  let type: OperationType = "NONE";

  const senders: string[] = [];
  const recipients: string[] = [];

  for (const transfer of transfers) {
    const amount = new BigNumber(transfer.amount);
    const accountId = AccountId.fromString(transfer.account);

    if (transfer.account === address) {
      value = amount.abs();
      type = amount.isNegative() ? "OUT" : "IN";
    }

    if (amount.isNegative()) {
      senders.push(transfer.account);
    } else if (shouldIncludeRecipient(accountId, recipients)) {
      recipients.push(transfer.account);
    }
  }

  return {
    type,
    value,
    senders: senders.reverse(),
    recipients: recipients.reverse(),
  };
}

function shouldIncludeRecipient(accId: AccountId, currentRecipients: string[]): boolean {
  if (accId.shard.eq(0) && accId.realm.eq(0)) {
    if (accId.num.lt(100)) {
      // account is a node, only add to list if we have none
      return currentRecipients.length === 0;
    }

    // account is a system account that is not a node
    // do NOT add
    if (accId.num.lt(1000)) {
      return false;
    }
  }

  return true;
}

export async function getOperationsForAccount(
  ledgerAccountId: string,
  address: string,
  latestOperationTimestamp: string,
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
        extra: { consensusTimestamp: rawTx.consensus_timestamp },
      });
    }
  }

  return { coinOperations, tokenOperations };
}
