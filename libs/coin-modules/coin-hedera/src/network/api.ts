import network from "@ledgerhq/live-network";
import type { LiveNetworkResponse } from "@ledgerhq/live-network/network";
import { log } from "@ledgerhq/logs";
import BigNumber from "bignumber.js";
import { encodeFunctionData, erc20Abi } from "viem";
import { HEDERA_TRANSACTION_NAMES } from "../constants";
import { HederaAddAccountError, HederaMirrorNodeResponseError } from "../errors";
import { resolveConfig } from "../logic/utils";
import type {
  HederaCoinConfig,
  HederaMirrorAccountTokensResponse,
  HederaMirrorBlocksResponse,
  HederaMirrorTransactionsResponse,
  HederaMirrorAccount,
  HederaMirrorAccountsResponse,
  HederaMirrorBlock,
  HederaMirrorToken,
  HederaMirrorTransaction,
  HederaMirrorNetworkFees,
  HederaMirrorContractCallResult,
  HederaMirrorContractCallEstimate,
  HederaMirrorNode,
  HederaMirrorNodesResponse,
} from "../types";

const LOG_TYPE = "coin-hedera";

const CORE_TRANSACTION_FIELDS = [
  "transaction_hash",
  "consensus_timestamp",
  "charged_tx_fee",
  "nonce",
  "result",
  "name",
] as const satisfies readonly (keyof HederaMirrorTransaction)[];

// fields getBlock.v2 reads from every transaction of a block, which is fetched without an account filter
const BLOCK_TRANSACTION_FIELDS = [
  "transaction_hash",
  "consensus_timestamp",
  "charged_tx_fee",
  "result",
  "name",
  "transaction_id",
] as const satisfies readonly (keyof HederaMirrorTransaction)[];

// fields read from the latest transaction, which is fetched without an account filter
const LATEST_TRANSACTION_FIELDS = [
  "consensus_timestamp",
] as const satisfies readonly (keyof HederaMirrorTransaction)[];

// fields read from every transaction of the contract call search window, which has no account filter
const CONTRACT_CALL_SEARCH_FIELDS = [
  "name",
  "transaction_id",
  "parent_consensus_timestamp",
] as const satisfies readonly (keyof HederaMirrorTransaction)[];

function requiredField<T>(value: T | null | undefined, path: string): T {
  if (value === null || value === undefined) {
    throw new HederaMirrorNodeResponseError(
      `Mirror node response is missing required field "${path}"`,
    );
  }
  return value;
}

function logMissingFields<T extends object>(
  kind: string,
  element: T | null | undefined,
  fields: readonly (keyof T & string)[],
  nullableFields: readonly (keyof T & string)[] = [],
): boolean {
  let complete = true;

  for (const field of fields) {
    const value = element?.[field];
    if (value === undefined || (value === null && !nullableFields.includes(field))) {
      log(LOG_TYPE, `Mirror node ${kind} has no value for "${field}"`);
      complete = false;
    }
  }

  return complete;
}

function assertCoreAccount(account: HederaMirrorAccount): HederaMirrorAccount {
  logMissingFields("account", account, ["account", "evm_address", "balance"]);
  logMissingFields("account balance", account?.balance, ["balance", "timestamp"]);
  account?.balance?.tokens?.forEach(token =>
    logMissingFields("account token", token, ["token_id"]),
  );

  return account;
}

function assertCoreToken(token: HederaMirrorToken): HederaMirrorToken {
  logMissingFields("token", token, ["token_id", "created_timestamp"]);

  return token;
}

function assertCoreNode(node: HederaMirrorNode): HederaMirrorNode {
  logMissingFields("node", node, [
    "node_account_id",
    "description",
    "min_stake",
    "max_stake",
    "stake_rewarded",
    "reward_rate_start",
  ]);

  return node;
}

function assertCoreContractCallResult(
  result: HederaMirrorContractCallResult,
): HederaMirrorContractCallResult {
  logMissingFields("contract call result", result, ["gas_limit", "timestamp"]);

  return result;
}

function assertCoreTransaction(
  transaction: HederaMirrorTransaction,
  fields: readonly (keyof HederaMirrorTransaction & string)[] = CORE_TRANSACTION_FIELDS,
): HederaMirrorTransaction {
  logMissingFields("transaction", transaction, fields, ["parent_consensus_timestamp"]);

  return transaction;
}

function assertCoreOwnTransaction(transaction: HederaMirrorTransaction): HederaMirrorTransaction {
  assertCoreTransaction(transaction);

  return transaction;
}

// without the core fields no operation can be built, so history drops such a transaction
function hasCoreFields(transaction: HederaMirrorTransaction): boolean {
  return logMissingFields("transaction", transaction, CORE_TRANSACTION_FIELDS, [
    "parent_consensus_timestamp",
  ]);
}

function assertBlockTransaction(transaction: HederaMirrorTransaction): HederaMirrorTransaction {
  assertCoreTransaction(transaction, BLOCK_TRANSACTION_FIELDS);

  return transaction;
}

// keeps old behavior when all pages are fetched
const getPaginationDirection = (fetchAllPages: boolean, order: string) => {
  if (fetchAllPages) return "gt";
  return order === "asc" ? "gt" : "lt";
};

async function getAccountsForPublicKey({
  configOrCurrencyId,
  publicKey,
}: {
  configOrCurrencyId: HederaCoinConfig | string;
  publicKey: string;
}): Promise<(HederaMirrorAccount & { account: string })[]> {
  const config = resolveConfig(configOrCurrencyId);

  let res;
  try {
    res = await network<HederaMirrorAccountsResponse>({
      method: "GET",
      url: `${config.apiUrls.mirrorNode}/api/v1/accounts?account.publicKey=${publicKey}&balance=true&limit=100`,
    });
  } catch (e: unknown) {
    if ((e as { name?: string })?.name === "LedgerAPI4xx") return [];
    throw e;
  }

  const accounts = requiredField(res.data.accounts, "accounts");
  accounts.forEach(assertCoreAccount);

  return accounts.filter((account): account is HederaMirrorAccount & { account: string } => {
    if (account?.account === null || account?.account === undefined) {
      log(LOG_TYPE, 'Skipping mirror node account without "account"');
      return false;
    }
    return true;
  });
}

/**
 * Fetches account information from the Hedera Mirror Node API, excluding transactions.
 *
 * @param configOrCurrencyId - Coin config object or currency ID string used to resolve the mirror node URL.
 * @param address - The Hedera account ID (e.g., "0.0.12345")
 * @param timestamp - Optional timestamp filter to get historical account state.
 *                    Supports comparison operators:
 *                    - "lt:1234567890.123456789" - state before the timestamp
 *                    - "eq:1234567890.123456789" - state at the timestamp
 *                    Used primarily for analyzing state changes in staking operations.
 * @returns Promise resolving to account data
 * @throws HederaAddAccountError if account not found (404)
 */
async function getAccount({
  configOrCurrencyId,
  address,
  timestamp,
}: {
  configOrCurrencyId: HederaCoinConfig | string;
  address: string;
  timestamp?: string;
}): Promise<HederaMirrorAccount> {
  const config = resolveConfig(configOrCurrencyId);

  try {
    const params = new URLSearchParams({
      transactions: "false",
      ...(timestamp && { timestamp }),
    });

    const res = await network<HederaMirrorAccount>({
      method: "GET",
      url: `${config.apiUrls.mirrorNode}/api/v1/accounts/${address}?${params.toString()}`,
    });
    const account = res.data;

    return assertCoreAccount(account);
  } catch (error) {
    if (
      (error as { name?: string; status?: number })?.name === "LedgerAPI4xx" &&
      (error as { status?: number })?.status === 404
    ) {
      throw new HederaAddAccountError();
    }

    throw error;
  }
}

async function getAccountTransactions({
  configOrCurrencyId,
  address,
  pagingToken,
  limit = 100,
  order = "desc",
  fetchAllPages,
  minTimestamp,
}: {
  configOrCurrencyId: HederaCoinConfig | string;
  address: string;
  pagingToken: string | null;
  limit?: number | undefined;
  order?: "asc" | "desc" | undefined;
  fetchAllPages: boolean;
  minTimestamp?: string;
}): Promise<{ transactions: HederaMirrorTransaction[]; nextCursor: string | null }> {
  const config = resolveConfig(configOrCurrencyId);
  const transactions: HederaMirrorTransaction[] = [];
  const params = new URLSearchParams({
    "account.id": address,
    limit: limit.toString(),
    order,
  });

  if (pagingToken) {
    params.append("timestamp", `${getPaginationDirection(fetchAllPages, order)}:${pagingToken}`);
  }
  if (minTimestamp) {
    params.append("timestamp", `gte:${minTimestamp}`);
  }

  let nextCursor: string | null = null;
  let nextPath: string | null = `/api/v1/transactions?${params.toString()}`;

  // WARNING: don't break the loop when `transactions` array is empty but `links.next` is present
  // the mirror node API enforces a 60-day max time range per query, even if `timestamp` param is set
  // see: https://hedera.com/blog/changes-to-the-hedera-operated-mirror-node
  while (nextPath) {
    const res: LiveNetworkResponse<HederaMirrorTransactionsResponse> = await network({
      method: "GET",
      url: `${config.apiUrls.mirrorNode}${nextPath}`,
    });
    const newTransactions = requiredField(res.data.transactions, "transactions");
    const links = requiredField(res.data.links, "links");
    for (const transaction of newTransactions) {
      if (hasCoreFields(transaction)) transactions.push(transaction);
    }
    nextPath = links.next;

    // stop fetching if pagination mode is used and we reached the limit
    if (!fetchAllPages && transactions.length >= limit) {
      break;
    }
  }

  // ensure we don't exceed the limit in pagination mode
  if (!fetchAllPages && transactions.length > limit) {
    transactions.splice(limit);
  }

  // set the next cursor only if we have more transactions to fetch
  if (!fetchAllPages && nextPath) {
    const lastTx = transactions.at(-1);
    nextCursor = lastTx?.consensus_timestamp ?? null;
  }

  return { transactions, nextCursor };
}

async function getAccountTokens({
  configOrCurrencyId,
  address,
}: {
  configOrCurrencyId: HederaCoinConfig | string;
  address: string;
}): Promise<HederaMirrorToken[]> {
  const config = resolveConfig(configOrCurrencyId);
  const tokens: HederaMirrorToken[] = [];
  const params = new URLSearchParams({
    limit: "100",
  });

  let nextPath: string | null = `/api/v1/accounts/${address}/tokens?${params.toString()}`;

  while (nextPath) {
    const res: LiveNetworkResponse<HederaMirrorAccountTokensResponse> = await network({
      method: "GET",
      url: `${config.apiUrls.mirrorNode}${nextPath}`,
    });
    const newTokens = requiredField(res.data.tokens, "tokens");
    const links = requiredField(res.data.links, "links");
    newTokens.forEach(assertCoreToken);
    tokens.push(...newTokens);
    nextPath = links.next;
  }

  return tokens;
}

async function getLatestTransaction({
  configOrCurrencyId,
  before,
}: {
  configOrCurrencyId: HederaCoinConfig | string;
  before: Date;
}): Promise<HederaMirrorTransaction> {
  const config = resolveConfig(configOrCurrencyId);
  const params = new URLSearchParams({
    limit: "1",
    order: "desc",
    timestamp: `lt:${before.getTime() / 1000}`,
  });

  const res = await network<HederaMirrorTransactionsResponse>({
    method: "GET",
    url: `${config.apiUrls.mirrorNode}/api/v1/transactions?${params.toString()}`,
  });
  const transaction = res.data.transactions?.[0];

  if (!transaction) {
    throw new Error("No transactions found on the Hedera network");
  }

  return assertCoreTransaction(transaction, LATEST_TRANSACTION_FIELDS);
}

async function getLatestBlock({
  configOrCurrencyId,
}: {
  configOrCurrencyId: HederaCoinConfig | string;
}): Promise<HederaMirrorBlock> {
  const config = resolveConfig(configOrCurrencyId);
  const params = new URLSearchParams({
    limit: "1",
    order: "desc",
  });

  const res = await network<HederaMirrorBlocksResponse>({
    method: "GET",
    url: `${config.apiUrls.mirrorNode}/api/v1/blocks?${params.toString()}`,
  });
  const block = res.data.blocks?.[0];

  if (!block) {
    throw new Error("No blocks found on the Hedera network");
  }

  return block;
}

async function getNetworkFees({
  configOrCurrencyId,
}: {
  configOrCurrencyId: HederaCoinConfig | string;
}): Promise<HederaMirrorNetworkFees> {
  const config = resolveConfig(configOrCurrencyId);
  const res = await network<HederaMirrorNetworkFees>({
    method: "GET",
    url: `${config.apiUrls.mirrorNode}/api/v1/network/fees`,
  });

  return res.data;
}

async function getContractCallResult({
  configOrCurrencyId,
  transactionHash,
}: {
  configOrCurrencyId: HederaCoinConfig | string;
  transactionHash: string;
}): Promise<HederaMirrorContractCallResult> {
  const config = resolveConfig(configOrCurrencyId);
  const res = await network<HederaMirrorContractCallResult>({
    method: "GET",
    url: `${config.apiUrls.mirrorNode}/api/v1/contracts/results/${transactionHash}`,
  });

  return assertCoreContractCallResult(res.data);
}

async function findTransactionByContractCallV2({
  configOrCurrencyId,
  timestamp,
  payerAddress,
}: {
  configOrCurrencyId: HederaCoinConfig | string;
  timestamp: string;
  payerAddress: string;
}): Promise<HederaMirrorTransaction | null> {
  const config = resolveConfig(configOrCurrencyId);

  // Hgraph API returns timestamp as number and nanoseconds precision is lost during parsing
  // instead of using `timestamp=eq:${timestamp}`, we need to fetch transactions in a small range
  // +-10 microseconds is used to bypass hgraph precision issue
  const timestampAsNumber = new BigNumber(timestamp).multipliedBy(10 ** 9);
  const timestampDiffNs = new BigNumber(10_000);
  const from = new BigNumber(timestampAsNumber).minus(timestampDiffNs).dividedBy(10 ** 9);
  const to = new BigNumber(timestampAsNumber).plus(timestampDiffNs).dividedBy(10 ** 9);

  const params = new URLSearchParams({ limit: "100", order: "desc" });
  params.append("timestamp", `gte:${from.toFixed(9)}`);
  params.append("timestamp", `lte:${to.toFixed(9)}`);

  const res = await network<HederaMirrorTransactionsResponse>({
    method: "GET",
    url: `${config.apiUrls.mirrorNode}/api/v1/transactions?${params.toString()}`,
  });

  // try to find main CONTRACT_CALL transaction related to the given address
  const transactions = requiredField(res.data.transactions, "transactions");
  transactions.forEach(tx => assertCoreTransaction(tx, CONTRACT_CALL_SEARCH_FIELDS));

  const relatedTx = transactions.find(tx => {
    return (
      tx.name === HEDERA_TRANSACTION_NAMES.ContractCall &&
      tx.transaction_id.startsWith(payerAddress) &&
      tx.parent_consensus_timestamp === null
    );
  });

  return relatedTx ?? null;
}

async function estimateContractCallGas({
  configOrCurrencyId,
  senderEvmAddress,
  recipientEvmAddress,
  contractEvmAddress,
  amount,
}: {
  configOrCurrencyId: HederaCoinConfig | string;
  senderEvmAddress: string;
  recipientEvmAddress: string;
  contractEvmAddress: string;
  amount: bigint;
}): Promise<BigNumber> {
  const config = resolveConfig(configOrCurrencyId);

  const res = await network<HederaMirrorContractCallEstimate>({
    method: "POST",
    url: `${config.apiUrls.mirrorNode}/api/v1/contracts/call`,
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

  return new BigNumber(res.data.result);
}

async function getTransactionsByTimestampRange({
  configOrCurrencyId,
  address,
  startTimestamp,
  endTimestamp,
  limit = 100,
  order = "desc",
}: {
  configOrCurrencyId: HederaCoinConfig | string;
  address?: string;
  startTimestamp: `${string}:${string}`;
  endTimestamp: `${string}:${string}`;
  limit?: number;
  order?: "asc" | "desc";
}): Promise<HederaMirrorTransaction[]> {
  const config = resolveConfig(configOrCurrencyId);
  const transactions: HederaMirrorTransaction[] = [];
  const params = new URLSearchParams({
    limit: limit.toString(),
    order,
    ...(address && { "account.id": address }),
  });

  params.append("timestamp", startTimestamp);
  params.append("timestamp", endTimestamp);

  let nextPath: string | null = `/api/v1/transactions?${params.toString()}`;

  while (nextPath) {
    const res: LiveNetworkResponse<HederaMirrorTransactionsResponse> = await network({
      method: "GET",
      url: `${config.apiUrls.mirrorNode}${nextPath}`,
    });
    const newTransactions = requiredField(res.data.transactions, "transactions");
    const links = requiredField(res.data.links, "links");
    newTransactions.forEach(tx =>
      address ? assertCoreOwnTransaction(tx) : assertBlockTransaction(tx),
    );
    transactions.push(...newTransactions);
    nextPath = links.next;
  }

  return transactions;
}

async function getNode({
  configOrCurrencyId,
  nodeId,
}: {
  configOrCurrencyId: HederaCoinConfig | string;
  nodeId: number;
}): Promise<HederaMirrorNode | null> {
  const config = resolveConfig(configOrCurrencyId);
  const params = new URLSearchParams({
    "node.id": `eq:${nodeId}`,
    limit: "1",
  });

  const res = await network<HederaMirrorNodesResponse>({
    method: "GET",
    url: `${config.apiUrls.mirrorNode}/api/v1/network/nodes?${params.toString()}`,
  });
  const node = requiredField(res.data.nodes, "nodes")[0];

  return node ? assertCoreNode(node) : null;
}

async function getNodes({
  configOrCurrencyId,
  cursor,
  limit = 100,
  order = "desc",
  fetchAllPages,
}: {
  configOrCurrencyId: HederaCoinConfig | string;
  cursor?: string;
  limit?: number;
  order?: "asc" | "desc";
  fetchAllPages: boolean;
}): Promise<{ nodes: HederaMirrorNode[]; nextCursor: string | null }> {
  const config = resolveConfig(configOrCurrencyId);
  const nodes: HederaMirrorNode[] = [];
  const params = new URLSearchParams({
    order,
    limit: limit.toString(),
  });

  if (cursor) {
    params.append("node.id", `${getPaginationDirection(fetchAllPages, order)}:${cursor}`);
  }

  let nextCursor: string | null = null;
  let nextPath: string | null = `/api/v1/network/nodes?${params.toString()}`;

  while (nextPath) {
    const res: LiveNetworkResponse<HederaMirrorNodesResponse> = await network({
      method: "GET",
      url: `${config.apiUrls.mirrorNode}${nextPath}`,
    });
    const newNodes = requiredField(res.data.nodes, "nodes");
    const links = requiredField(res.data.links, "links");
    newNodes.forEach(assertCoreNode);
    nodes.push(...newNodes);
    nextPath = links.next;

    // stop fetching if pagination mode is used and we reached the limit
    if (!fetchAllPages && nodes.length >= limit) {
      break;
    }
  }

  // ensure we don't exceed the limit in pagination mode
  if (!fetchAllPages && nodes.length > limit) {
    nodes.splice(limit);
  }

  // set the next cursor only if we have more nodes to fetch
  if (!fetchAllPages && nextPath) {
    const lastNode = nodes.at(-1);
    nextCursor = lastNode?.node_id.toString() ?? null;
  }

  return { nodes, nextCursor };
}

export const apiClient = {
  getAccountsForPublicKey,
  getAccount,
  getAccountTokens,
  getAccountTransactions,
  getLatestBlock,
  getLatestTransaction,
  getNetworkFees,
  getContractCallResult,
  findTransactionByContractCallV2,
  estimateContractCallGas,
  getTransactionsByTimestampRange,
  getNode,
  getNodes,
};
