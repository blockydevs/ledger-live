import BigNumber from "bignumber.js";
import { encodeFunctionData, erc20Abi } from "viem";
import network from "@ledgerhq/live-network/network";
import { getEnv } from "@ledgerhq/live-env";
import { LedgerAPI4xx } from "@ledgerhq/errors";
import { HederaAddAccountError } from "../errors";
import type {
  HederaMirrorAccount,
  HederaMirrorToken,
  HederaMirrorTransaction,
  HederaMirrorContractCallResult,
  HederaMirrorCallContractBalance,
  HederaMirrorCallContractEstimate,
  HederaMirrorNetworkFees,
} from "./types";

const API_URL = getEnv("API_HEDERA_MIRROR");

export async function getAccountsForPublicKey(publicKey: string): Promise<HederaMirrorAccount[]> {
  let r;
  try {
    r = await network({
      method: "GET",
      url: `${API_URL}/api/v1/accounts?account.publicKey=${publicKey}&balance=true&limit=100`,
    });
  } catch (e: any) {
    if (e.name === "LedgerAPI4xx") return [];
    throw e;
  }

  const accounts = r.data.accounts as HederaMirrorAccount[];

  return accounts;
}

export async function getAccount(address: string): Promise<HederaMirrorAccount> {
  try {
    const res = await network({
      method: "GET",
      url: `${API_URL}/api/v1/accounts/${address}`,
    });
    const account = res.data as HederaMirrorAccount;

    return account;
  } catch (error) {
    if (error instanceof LedgerAPI4xx && "status" in error && error.status === 404) {
      throw new HederaAddAccountError();
    }

    throw error;
  }
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

  let nextPath = `/api/v1/transactions?${params.toString()}`;

  // WARNING: don't break the loop when `transactions` array is empty but `links.next` is present
  // the mirror node API enforces a 60-day max time range per query, even if `timestamp` param is set
  // see: https://hedera.com/blog/changes-to-the-hedera-operated-mirror-node
  while (nextPath) {
    const res = await network({
      method: "GET",
      url: `${API_URL}${nextPath}`,
    });
    const newTransactions = res.data.transactions as HederaMirrorTransaction[];
    transactions.push(...newTransactions);
    nextPath = res.data.links.next;
  }

  return transactions;
}

export async function getAccountTokens(address: string): Promise<HederaMirrorToken[]> {
  const tokens: HederaMirrorToken[] = [];
  const params = new URLSearchParams({
    limit: "100",
  });

  let nextPath = `/api/v1/accounts/${address}/tokens?${params.toString()}`;

  while (nextPath) {
    const res = await network({
      method: "GET",
      url: `${API_URL}${nextPath}`,
    });
    const newTokens = res.data.tokens as HederaMirrorToken[];
    tokens.push(...newTokens);
    nextPath = res.data.links.next;
  }

  return tokens;
}

export async function getNetworkFees(): Promise<HederaMirrorNetworkFees> {
  const res = await network({
    method: "GET",
    url: `${API_URL}/api/v1/network/fees`,
  });

  return res.data as HederaMirrorNetworkFees;
}

export async function getContractCallResult(
  transactionHash: string,
): Promise<HederaMirrorContractCallResult> {
  const res = await network({
    method: "GET",
    url: `${API_URL}/api/v1/contracts/results/${transactionHash}`,
  });

  return res.data as HederaMirrorContractCallResult;
}

export async function getMirrorTransactionForContractCallResult(
  timestamp: string,
  contractId: string,
): Promise<HederaMirrorTransaction | null> {
  const res = await network({
    method: "GET",
    url: `${API_URL}/api/v1/transactions?timestamp=${timestamp}`,
  });
  const transactions = res.data.transactions as HederaMirrorTransaction[];

  return transactions.find(el => el.name === "CONTRACTCALL" && el.entity_id === contractId) ?? null;
}

export async function getERC20TokenBalance(
  accountEvmAddress: string,
  contractEvmAddress: string,
): Promise<BigNumber> {
  const res = await network({
    method: "POST",
    url: `${API_URL}/api/v1/contracts/call`,
    data: {
      block: "latest",
      to: contractEvmAddress,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [accountEvmAddress as `0x${string}`],
      }),
    },
  });

  const data = res.data as HederaMirrorCallContractBalance;

  return new BigNumber(data.result);
}

export async function estimateContractCallGas(
  senderEvmAddress: string,
  recipientEvmAddress: string,
  contractEvmAddress: string,
  amount: bigint,
): Promise<BigNumber> {
  const res = await network({
    method: "POST",
    url: `${API_URL}/api/v1/contracts/call`,
    data: {
      block: "latest",
      estimate: true,
      from: senderEvmAddress,
      to: contractEvmAddress,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [recipientEvmAddress as `0x${string}`, amount],
      }),
    },
  });

  const data = res.data as HederaMirrorCallContractEstimate;

  return new BigNumber(data.result);
}
