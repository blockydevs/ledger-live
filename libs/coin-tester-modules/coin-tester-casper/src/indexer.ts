import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import type { Operation } from "@ledgerhq/types-live";
import type { IndexerResponseRoot, ITxnHistoryData } from "@ledgerhq/coin-casper/api/types";

const entriesByPublicKey = new Map<string, ITxnHistoryData[]>();

/**
 * The real indexer serves one deploy under both the caller's and the target's
 * public key. Indexing it twice is what makes the recipient's sync produce IN.
 */
export function indexTransfer(optimistic: Operation): void {
  const entry = txHistoryEntry(optimistic);
  append(optimistic.senders[0], entry);
  if (optimistic.recipients[0] !== optimistic.senders[0]) {
    append(optimistic.recipients[0], entry);
  }
}

function append(publicKey: string, entry: ITxnHistoryData): void {
  entriesByPublicKey.set(publicKey, [...(entriesByPublicKey.get(publicKey) ?? []), entry]);
}

/**
 * The declared return type is load-bearing: `args.id` is non-optional in the
 * type, so the compiler guards against entries with no `args.id` object. Missing
 * that field would throw a TypeError in `mapTxToOps` and surface as a history-less
 * account.
 */
function txHistoryEntry(optimistic: Operation): ITxnHistoryData {
  const { transferId } = optimistic.extra as { transferId?: string };
  const amount = optimistic.value.minus(optimistic.fee).toFixed();

  return {
    deploy_hash: optimistic.hash,
    // mapTxToOps writes blockHash: null whatever this holds.
    block_hash: "",
    caller_public_key: optimistic.senders[0],
    execution_type_id: 1,
    cost: optimistic.fee.toFixed(),
    payment_amount: optimistic.fee.toFixed(),
    error_message: undefined,
    timestamp: optimistic.date.toISOString(),
    status: "success",
    args: {
      id: {
        parsed: transferId !== undefined ? Number(transferId) : undefined,
        cl_type: { Option: "U64" },
      },
      amount: { parsed: amount, cl_type: "U512" },
      target: { parsed: optimistic.recipients[0], cl_type: "PublicKey" },
    },
    amount,
  };
}

const ALLOWED_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

/** Installs the indexer mock and returns a closer. Resets prior runs' history. */
export function startIndexer(): () => void {
  entriesByPublicKey.clear();

  const server = setupServer(
    http.get("*/accounts/:publicKey/ledgerlive-deploys", ({ params }) => {
      const data = entriesByPublicKey.get(params.publicKey as string) ?? [];
      const body: IndexerResponseRoot<ITxnHistoryData> = {
        data,
        page_count: 1,
        item_count: data.length,
        pages: [{ number: 1, url: "" }],
      };
      return HttpResponse.json(body);
    }),
  );

  server.listen({
    onUnhandledRequest: request => {
      // The devnet RPC sits on localhost and must pass through. Any other host is
      // an indexer path we do not handle, and should fail loudly.
      const { hostname } = new URL(request.url);
      if (ALLOWED_HOSTNAMES.has(hostname)) return;
      throw new Error(`Unhandled request: ${request.method} ${request.url}`);
    },
  });

  return () => server.close();
}
