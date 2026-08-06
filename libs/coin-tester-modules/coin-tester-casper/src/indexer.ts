import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import type { InfoGetTransactionResult } from "casper-js-sdk";
import { getCasperNodeRpcClient } from "@ledgerhq/coin-casper/api";
import type {
  IndexerResponseRoot,
  ITxnHistoryData,
  RpcError,
} from "@ledgerhq/coin-casper/api/types";

const entriesByPublicKey = new Map<string, ITxnHistoryData[]>();

// A fresh broadcast answers with this RPC code until the node has
// deduplicated it — not an error, just "not included yet".
const TRANSACTION_NOT_KNOWN_YET = -32014;
const POLL_ATTEMPTS = 40;
const POLL_INTERVAL_MS = 3 * 1000;

// Polls the node until the transaction lands in a block.
export async function readTransaction(hash: string): Promise<InfoGetTransactionResult> {
  const client = getCasperNodeRpcClient();
  const startedAt = Date.now();

  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    try {
      const result = await client.getTransactionByTransactionHash(hash);
      if (result.executionInfo) return result;
    } catch (error) {
      if ((error as RpcError).statusCode !== TRANSACTION_NOT_KNOWN_YET) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(
    `Transaction ${hash} not included after ${Math.round((Date.now() - startedAt) / 1000)}s`,
  );
}

// Indexed under both the caller's and target's public key, matching the real
// indexer — that's what makes the recipient's sync produce an IN operation.
export async function indexTransfer(hash: string): Promise<void> {
  const result = await readTransaction(hash);
  const entry = txHistoryEntry(result);
  append(entry.caller_public_key, entry);
  if (entry.args.target.parsed !== entry.caller_public_key) {
    append(entry.args.target.parsed, entry);
  }
}

function append(publicKey: string, entry: ITxnHistoryData): void {
  entriesByPublicKey.set(publicKey, [...(entriesByPublicKey.get(publicKey) ?? []), entry]);
}

interface RawTransactionV1JSON {
  transaction: {
    Version1: {
      payload: {
        fields: {
          args: {
            Named: [string, { parsed: unknown }][];
          };
        };
      };
    };
  };
}

// Parsed argument values live in `rawJSON`; the typed `Args` object only
// exposes each argument as an undecoded `CLValue`.
function namedArg(rawJSON: unknown, name: string): { parsed: unknown } {
  const found = optionalNamedArg(rawJSON, name);
  if (!found) throw new Error(`Transaction is missing the "${name}" argument`);
  return found;
}

// A native transfer with no transfer id carries no `id` argument at all.
function optionalNamedArg(rawJSON: unknown, name: string): { parsed: unknown } | undefined {
  const named = (rawJSON as RawTransactionV1JSON).transaction.Version1.payload.fields.args.Named;
  return named.find(([argName]) => argName === name)?.[1];
}

// The declared return type is load-bearing: `args.id` is non-optional, so the
// compiler guards against entries missing it (mapTxToOps would throw).
function txHistoryEntry(result: InfoGetTransactionResult): ITxnHistoryData {
  const { transaction, executionInfo, rawJSON } = result;
  const hash = transaction.hash.toHex();

  const callerPublicKey = transaction.initiatorAddr.publicKey;
  if (!callerPublicKey) throw new Error(`Transaction ${hash} has no initiator public key`);

  // readTransaction only returns once executionInfo is present.
  const executionResult = executionInfo!.executionResult;
  const cost = executionResult.cost.toString();

  const amount = namedArg(rawJSON, "amount");
  const target = namedArg(rawJSON, "target");
  const id = optionalNamedArg(rawJSON, "id");

  return {
    deploy_hash: hash,
    block_hash: executionInfo!.blockHash.toHex(),
    caller_public_key: callerPublicKey.toHex(),
    execution_type_id: 1,
    cost,
    payment_amount: cost,
    error_message: executionResult.errorMessage,
    timestamp: transaction.timestamp.toJSON(),
    status: executionResult.errorMessage ? "failed" : "success",
    args: {
      id: {
        parsed: id?.parsed as number | undefined,
        cl_type: { Option: "U64" },
      },
      amount: { parsed: String(amount.parsed), cl_type: "U512" },
      target: { parsed: String(target.parsed), cl_type: "PublicKey" },
    },
    amount: String(amount.parsed),
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
      // Let the devnet RPC (localhost) through; fail loudly on anything else.
      const { hostname } = new URL(request.url);
      if (ALLOWED_HOSTNAMES.has(hostname)) return;
      throw new Error(`Unhandled request: ${request.method} ${request.url}`);
    },
  });

  return () => server.close();
}
