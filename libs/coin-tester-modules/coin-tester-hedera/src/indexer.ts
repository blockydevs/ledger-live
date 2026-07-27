import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { FAKE_HGRAPH_URL, HBAR_USD_RATE, HEDERA, LOCAL_MIRROR_NODE_PORT } from "./fixtures";
import {
  getErcTokenAccountRows,
  getErcTokenTransferRows,
  getLatestEthereumTransactionTimestamp,
  HgraphFakeGuardError,
} from "./hgraphFake";

const observer = { callCount: 0, queries: [] as string[] };

export function getHgraphObserver(): { callCount: number; queries: string[] } {
  return observer;
}

interface HgraphRequestBody {
  query?: string;
  variables?: Record<string, unknown>;
}

/**
 * Cross-checks the branch picked from `variables` against the query text's root field, so a query
 * shape this fake doesn't recognize (e.g. `getERC20TransfersByTimestampRange`, currently unreachable
 * from the sync path) fails loudly here instead of silently misrouting into the wrong branch.
 */
function assertQueryNamesRootField(query: string, rootField: string): void {
  if (!query.includes(rootField)) {
    throw new Error(
      `indexer.ts: routed this request to hgraphFake's "${rootField}" branch based on its ` +
        `variables, but the query text does not mention "${rootField}" — routing/variables shape ` +
        `mismatch. Query was: ${query}`,
    );
  }
}

function wellFormedEmpty(rootField: "erc_token_account" | "erc_token_transfer"): Response {
  return HttpResponse.json({ data: { [rootField]: [] } });
}

async function hgraphHandler(request: Request): Promise<Response> {
  const body = (await request.clone().json()) as HgraphRequestBody;
  const query = body.query ?? "";
  const variables = body.variables ?? {};

  observer.callCount += 1;
  observer.queries.push(query);

  // Routing is on `variables` shape: erc_token_transfer has tokenEvmAddresses, erc_token_account
  // has accountId only, ethereum_transaction has no variables key at all.
  if ("tokenEvmAddresses" in variables) {
    assertQueryNamesRootField(query, "erc_token_transfer");
    try {
      const rows = await getErcTokenTransferRows(
        variables as {
          accountId: string;
          tokenEvmAddresses: string[];
          cursor?: string | null;
          limit: number;
        },
      );
      return HttpResponse.json({ data: { erc_token_transfer: rows } });
    } catch (err) {
      // Guard throws (bugs in us) stay loud; I/O failures (mirror node down) degrade quietly.
      if (err instanceof HgraphFakeGuardError) throw err;
      console.error("indexer.ts: erc_token_transfer lookup against the mirror node failed:", err);
      return wellFormedEmpty("erc_token_transfer");
    }
  }

  if ("accountId" in variables) {
    assertQueryNamesRootField(query, "erc_token_account");
    try {
      const rows = await getErcTokenAccountRows(variables as { accountId: string });
      return HttpResponse.json({ data: { erc_token_account: rows } });
    } catch (err) {
      if (err instanceof HgraphFakeGuardError) throw err;
      console.error("indexer.ts: erc_token_account lookup against the mirror node failed:", err);
      return wellFormedEmpty("erc_token_account");
    }
  }

  assertQueryNamesRootField(query, "ethereum_transaction");
  try {
    const row = await getLatestEthereumTransactionTimestamp();
    // getLatestIndexedConsensusTimestamp reads ethereum_transaction[0]?.consensus_timestamp, so it
    // must be wrapped as the single element of an array here.
    return HttpResponse.json({ data: { ethereum_transaction: [row] } });
  } catch (err) {
    if (err instanceof HgraphFakeGuardError) throw err;
    console.error(
      "indexer.ts: ethereum_transaction (latest indexed timestamp) lookup against the mirror node failed:",
      err,
    );
    // Must never be empty even on failure: coin-hedera's invariant("No transactions found in
    // Hgraph") would otherwise trip. Wall clock is a safe floor.
    const wallClockNanos = BigInt(Date.now()) * 1_000_000n;
    return HttpResponse.json({
      data: { ethereum_transaction: [{ consensus_timestamp: wallClockNanos.toString() }] },
    });
  }
}

export function initMswHandlers(): () => void {
  observer.callCount = 0;
  observer.queries = [];

  const server = setupServer(
    http.post(FAKE_HGRAPH_URL, ({ request }) => hgraphHandler(request)),
    http.get("https://global.api.prd.ledger.com/cal/*", () => HttpResponse.json([])),
    http.get("https://nft.api.live.ledger.com/*", () => HttpResponse.json([])),
    http.get("https://earn.api.live.ledger.com/*", () => HttpResponse.json([])),
    // Must be a real number: an empty response makes estimateFees fall back to
    // DEFAULT_TINYBAR_FEE and fails the HEDERA_TOKEN_ASSOCIATION_MIN_USD check.
    http.get("https://countervalues.live.ledger.com/v3/spot/simple", () =>
      HttpResponse.json({ [HEDERA.id]: HBAR_USD_RATE }),
    ),
  );

  server.listen({
    onUnhandledRequest: req => {
      const { hostname, port } = new URL(req.url);
      // Real local mirror node (Solo) and the fake's own fetches into it must pass through
      // unmocked; narrowed to that port so no other localhost traffic is waved through silently.
      if (["127.0.0.1", "localhost"].includes(hostname) && port === LOCAL_MIRROR_NODE_PORT) {
        return;
      }
      throw new Error(`Unhandled MSW request: ${req.method} ${req.url}`);
    },
  });

  return () => server.close();
}
