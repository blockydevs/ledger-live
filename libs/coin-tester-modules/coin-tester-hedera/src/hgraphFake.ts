// Translates real Solo mirror-node responses into the hgraph GraphQL response shapes coin-hedera
// consumes (@ledgerhq/coin-hedera/types/hgraph). msw wiring lives in indexer.ts.
import { decodeEventLog, encodeFunctionData, erc20Abi, zeroAddress, type Address } from "viem";
import { LOCAL_MIRROR_NODE_URL } from "./fixtures";

interface RegisteredToken {
  contractId: string;
  evmAddress: string;
}

const tokensByEvmAddress = new Map<string, RegisteredToken>();

/** Marks the fake's own programming-error guards (missing `refresh()`, pagination runaway) as
 * distinct from a genuine mirror-node I/O failure, so indexer.ts can rethrow instead of
 * swallowing them into a well-formed empty response. */
export class HgraphFakeGuardError extends Error {}

/** Records a deployed ERC20 so the fake can answer hgraph queries about it. Keyed by
 * `evmAddress.toLowerCase()`. */
export function registerErc20Token(contractId: string, evmAddress: string): void {
  tokensByEvmAddress.set(evmAddress.toLowerCase(), {
    contractId,
    evmAddress: evmAddress.toLowerCase(),
  });
}

/** Clears the registry and any transfer snapshot. Not wired into `initMswHandlers` since
 * `setupHederaScenario` handles registration itself; call from scenario teardown instead. */
export function resetErc20Tokens(): void {
  tokensByEvmAddress.clear();
  transferSnapshot = null;
  transferPageCount = 0;
}

// Mirrors coin-hedera's ERC20TokenAccount/ERC20TokenTransfer, except `consensus_timestamp` is a
// digit string here even though coin-hedera types it `number`: `new BigNumber(digitString)`
// round-trips exactly, where a JS `number` would lose precision.
export interface FakeErcTokenAccount {
  token_id: number;
  token_evm_address: string;
  balance: number;
  balance_timestamp: number;
  created_timestamp: number;
}

export type FakeTransferType = "mint" | "burn" | "transfer";

export interface FakeErcTokenTransfer {
  token_id: number;
  token_evm_address: string;
  sender_evm_address: string | null;
  sender_account_id: number | null;
  receiver_evm_address: string | null;
  receiver_account_id: number | null;
  payer_account_id: number;
  amount: number;
  transfer_type: FakeTransferType;
  consensus_timestamp: string;
  transaction_hash: string;
}

// ---- Shared helpers ------------------------------------------------------------------------------

function entityNum(entityId: string): number {
  return Number(entityId.split(".").pop());
}

/** Every account here is created via `setKeyWithoutAlias` (src/genesis.ts), so its EVM address is a
 * "long-zero" address: 4 bytes shard + 8 bytes realm + 8 bytes num, shard/realm always zero for us. */
const LONG_ZERO_PATTERN = /^0x0{24}([0-9a-f]{16})$/i;

/** Decodes a long-zero EVM address to its account num arithmetically — no lookups, no cache.
 * Returns `null` for a non-long-zero (ECDSA-alias) address: hgraph would leave `*_account_id`
 * unindexed for such a party, and the consumer falls back to the EVM address. */
function longZeroToAccountNum(evmAddress: string): number | null {
  const match = evmAddress.match(LONG_ZERO_PATTERN);
  return match ? Number(BigInt(`0x${match[1]}`)) : null;
}

function accountNumToLongZeroEvmAddress(accountNum: string | number): Address {
  return `0x${"0".repeat(24)}${BigInt(accountNum).toString(16).padStart(16, "0")}` as Address;
}

/** `"1753600000.000000005"` -> `"1753600000000000005"` (hgraph.ts strips the dot the same way). */
function toNanosDigitString(secondsDotNanos: string): string {
  const [seconds, nanos = "0"] = secondsDotNanos.split(".");
  return `${seconds}${nanos.padEnd(9, "0")}`;
}

function toNanosBigInt(secondsDotNanos: string): bigint {
  return BigInt(toNanosDigitString(secondsDotNanos));
}

async function fetchMirrorNode<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${LOCAL_MIRROR_NODE_URL}${path}`, init);
  if (!res.ok) {
    throw new Error(`hgraphFake: ${init?.method ?? "GET"} ${path} returned ${res.status}`);
  }
  return (await res.json()) as T;
}

// erc_token_account is answered live (no snapshot), one /contracts/call per registered token, so
// there's no "forgot to refresh" bug class. Same endpoint/shape as waitForErc20Balance in genesis.ts.
async function fetchBalance(token: RegisteredToken, accountId: string): Promise<bigint> {
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [accountNumToLongZeroEvmAddress(accountId)],
  });

  const body = await fetchMirrorNode<{ result?: string }>("/api/v1/contracts/call", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ block: "latest", to: token.evmAddress, data }),
  });

  if (typeof body.result !== "string") {
    throw new Error(`hgraphFake: contracts/call for ${token.evmAddress} returned no result`);
  }
  return BigInt(body.result);
}

/** Handler-facing entry point for the `erc_token_account` query. `accountId` is the numeric
 * account num, matching what the real client sends. `token_id` is unused by coin-hedera on this
 * path; filled with the real contract num for fidelity only. */
export async function getErcTokenAccountRows({
  accountId,
}: {
  accountId: string;
}): Promise<FakeErcTokenAccount[]> {
  const now = Date.now();
  return Promise.all(
    [...tokensByEvmAddress.values()].map(async token => {
      const balance = await fetchBalance(token, accountId);
      return {
        token_id: entityNum(token.contractId),
        token_evm_address: token.evmAddress,
        // A future decimals bump could lose precision here; safe at this fixture's scale.
        balance: Number(balance),
        balance_timestamp: now,
        created_timestamp: now,
      };
    }),
  );
}

// erc_token_transfer reads from a frozen snapshot taken in refresh(), so cursor slicing (pagination
// is stateful) stays safe against the underlying array growing mid-walk. Anchored on transactions,
// not logs: a CONTRACTCALL transaction carries payer, consensus_timestamp and transaction_hash up
// front, which logs don't. Every refresh() fully re-scans rather than tracking a cursor — volume
// here is only double digits, and a forgotten-reset cursor fails worse (silent zero/cross-
// contamination) than a full re-scan ever does.

interface MirrorTransactionsPage {
  transactions: {
    transaction_id: string;
    transaction_hash: string;
    consensus_timestamp: string;
    parent_consensus_timestamp: string | null;
    entity_id: string | null;
    name: string;
  }[];
  links?: { next: string | null };
}

interface MirrorContractLog {
  address: string;
  data: string;
  topics: string[];
}

interface MirrorContractLogsPage {
  logs: MirrorContractLog[];
}

/** Guards the mirror-node re-scan against a pathological unbounded `links.next` chain. */
const MIRROR_SCAN_MAX_PAGES = 50;

async function fetchContractCallTransactions(): Promise<MirrorTransactionsPage["transactions"]> {
  const all: MirrorTransactionsPage["transactions"] = [];
  let path: string | null = "/api/v1/transactions?transactiontype=CONTRACTCALL&limit=100&order=asc";
  let pages = 0;

  while (path) {
    if (++pages > MIRROR_SCAN_MAX_PAGES) {
      throw new Error(
        `hgraphFake: mirror-node transaction re-scan exceeded ${MIRROR_SCAN_MAX_PAGES} pages`,
      );
    }
    const page: MirrorTransactionsPage = await fetchMirrorNode<MirrorTransactionsPage>(path);
    all.push(...page.transactions);
    path = page.links?.next ?? null;
  }

  // Top-level CONTRACTCALL only: findTransactionByContractCallV2 requires
  // parent_consensus_timestamp === null too.
  return all.filter(tx => tx.name === "CONTRACTCALL" && tx.parent_consensus_timestamp === null);
}

async function fetchLogsForTransaction(
  tx: MirrorTransactionsPage["transactions"][number],
): Promise<MirrorContractLog[]> {
  if (!tx.entity_id) return [];
  const page = await fetchMirrorNode<MirrorContractLogsPage>(
    `/api/v1/contracts/${tx.entity_id}/results/logs?timestamp=eq:${tx.consensus_timestamp}`,
  );
  return page.logs;
}

/** The constructor mints via `Transfer(0x0, deployer, supply)`; zero address is handled explicitly
 * since decoding it through the long-zero path would produce the wrong account num ("0.0.0"). */
function buildTransferRow(
  tx: MirrorTransactionsPage["transactions"][number],
  log: MirrorContractLog,
): FakeErcTokenTransfer | null {
  const token = tokensByEvmAddress.get(log.address.toLowerCase());
  if (!token) return null; // not one of ours

  let decoded;
  try {
    decoded = decodeEventLog({
      abi: erc20Abi,
      data: log.data as `0x${string}`,
      topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
    });
  } catch {
    return null; // not a Transfer-shaped log we understand (e.g. Approval)
  }
  if (decoded.eventName !== "Transfer") return null;

  const { from, to, value } = decoded.args;
  const fromIsZero = from.toLowerCase() === zeroAddress;
  const toIsZero = to.toLowerCase() === zeroAddress;

  return {
    token_id: entityNum(token.contractId),
    token_evm_address: token.evmAddress,
    // decodeEventLog checksums addresses (EIP-55); lowercase to match token_evm_address/registry key.
    sender_evm_address: fromIsZero ? null : from.toLowerCase(),
    sender_account_id: fromIsZero ? null : longZeroToAccountNum(from),
    receiver_evm_address: toIsZero ? null : to.toLowerCase(),
    receiver_account_id: toIsZero ? null : longZeroToAccountNum(to),
    payer_account_id: entityNum(tx.transaction_id.split("-")[0]),
    amount: Number(value), // a future decimals bump could truncate a bigint amount silently
    transfer_type: fromIsZero ? "mint" : toIsZero ? "burn" : "transfer",
    consensus_timestamp: toNanosDigitString(tx.consensus_timestamp),
    // transaction_id, not the mirror node's transaction_hash: the real REST API returns
    // transaction_hash base64-encoded, but enrichERC20Transfers feeds this field straight into
    // getContractCallResult, which only resolves a transaction id or a 32-byte hex hash.
    transaction_hash: tx.transaction_id,
  };
}

let transferSnapshot: FakeErcTokenTransfer[] | null = null;
let transferPageCount = 0;

/**
 * Rebuilds the `erc_token_transfer` snapshot from the real mirror node. Called from the scenario's
 * `beforeSync`, which runs outside the retry loop's try/catch, so a transient mirror-node error
 * here (a 503, a connection reset) must not end the scenario outright: I/O failures are swallowed
 * and the previous snapshot is kept, degrading into a retryable "transfer hasn't arrived yet"
 * assertion failure instead. The page-guard counter only resets on success, so a never-initialised
 * snapshot still throws its "queried before refresh()" guard rather than being masked.
 */
export async function refresh(): Promise<void> {
  try {
    const transactions = await fetchContractCallTransactions();
    const rows: FakeErcTokenTransfer[] = [];

    for (const tx of transactions) {
      const logs = await fetchLogsForTransaction(tx);
      for (const log of logs) {
        const row = buildTransferRow(tx, log);
        if (row) rows.push(row);
      }
    }

    // Transactions are fetched order=asc for stable pagination, so sort desc here instead.
    rows.sort((a, b) => {
      const diff = BigInt(b.consensus_timestamp) - BigInt(a.consensus_timestamp);
      return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    });
    transferSnapshot = rows;
    transferPageCount = 0;
  } catch (err) {
    console.error("hgraphFake: refresh() failed against the mirror node, keeping previous snapshot:", err);
  }
}

// getERC20Transfers always calls with fetchAllPages: true and no order/limit, which resolves to
// "> cursor, sorted desc" — implemented faithfully here rather than defending against that.
const MAX_TRANSFER_PAGES = 50;

/**
 * Handler-facing entry point for the `erc_token_transfer` query. Filters the frozen snapshot by
 * token + account, applies the `> cursor` filter, sorts desc, slices to `limit`. Throws after
 * `MAX_TRANSFER_PAGES` calls without an intervening `refresh()`, turning a client-side pagination
 * hang into an immediate, named error instead of a 6-minute Jest timeout with no diagnostics.
 */
export function getErcTokenTransferRows({
  accountId,
  tokenEvmAddresses,
  cursor,
  limit,
}: {
  accountId: string;
  tokenEvmAddresses: string[];
  cursor?: string | null;
  limit: number;
}): FakeErcTokenTransfer[] {
  if (transferSnapshot === null) {
    throw new HgraphFakeGuardError(
      "hgraphFake: erc_token_transfer queried before refresh() populated a snapshot",
    );
  }

  transferPageCount += 1;
  if (transferPageCount > MAX_TRANSFER_PAGES) {
    throw new HgraphFakeGuardError(
      `hgraphFake: erc_token_transfer exceeded ${MAX_TRANSFER_PAGES} pages since the last refresh() — ` +
        "this is a guard against the fake looping forever, not real hgraph behaviour",
    );
  }

  const tokenSet = new Set(tokenEvmAddresses.map(a => a.toLowerCase()));
  const numericAccountId = Number(accountId);

  let rows = transferSnapshot.filter(
    row =>
      tokenSet.has(row.token_evm_address.toLowerCase()) &&
      (row.sender_account_id === numericAccountId || row.receiver_account_id === numericAccountId),
  );

  if (cursor != null) {
    const cursorValue = BigInt(cursor);
    rows = rows.filter(row => BigInt(row.consensus_timestamp) > cursorValue);
  }

  return rows.slice(0, limit); // already sorted desc by refresh()
}

// ethereum_transaction is answered live as max(latest contract result, wall clock). The wall-clock
// floor matters because "hedera"/"hedera token"/"hedera staking" share one Solo cluster and run
// before any contract exists, so an empty results page must not trip coin-hedera's
// `invariant(..., "No transactions found in Hgraph")`.

interface MirrorContractResultsPage {
  results?: { timestamp: string }[];
}

async function fetchLatestContractResultNanos(): Promise<bigint | null> {
  const page = await fetchMirrorNode<MirrorContractResultsPage>(
    "/api/v1/contracts/results?limit=1&order=desc",
  );
  const timestamp = page.results?.[0]?.timestamp;
  return timestamp ? toNanosBigInt(timestamp) : null;
}

/** Handler-facing entry point for the `ethereum_transaction` (latest indexed timestamp) query. */
export async function getLatestEthereumTransactionTimestamp(): Promise<{
  consensus_timestamp: string;
}> {
  const latestNanos = await fetchLatestContractResultNanos();
  const wallClockNanos = BigInt(Date.now()) * 1_000_000n;
  const floor = latestNanos !== null && latestNanos > wallClockNanos ? latestNanos : wallClockNanos;
  return { consensus_timestamp: floor.toString() };
}
