import { http, HttpResponse, type RequestHandler } from "msw";
import { ALEO_FAKE_NODE, ALEO_NETWORK_TYPE } from "../fixtures";
import { getAccountTransactionRows } from "./indexer";
import { fetchAccountBalanceV2, fetchLatestBlockV2, fetchTransactionV2 } from "./node";
import { handleProve, type ExpectedTransfer, type ProveRequestBody } from "./prove";

const V2 = `${ALEO_FAKE_NODE}/v2/${ALEO_NETWORK_TYPE}`;

function toFailure(error: unknown): HttpResponse {
  const message = error instanceof Error ? error.message : String(error);
  // The unencrypted broadcast path returns res.transaction.id without reading
  // broadcast_result, so only an HTTP status makes live-network throw.
  return HttpResponse.json({ error: message }, { status: 500 });
}

export function buildAleoHandlers(expected: ExpectedTransfer): RequestHandler[] {
  return [
    http.get(`${V2}/blocks/latest`, async () => {
      try {
        return HttpResponse.json(await fetchLatestBlockV2());
      } catch (error) {
        return toFailure(error);
      }
    }),

    http.get(`${V2}/program/credits.aleo/mapping/account/:address`, async ({ params }) => {
      try {
        return HttpResponse.json(await fetchAccountBalanceV2(String(params.address)));
      } catch (error) {
        return toFailure(error);
      }
    }),

    http.get(`${V2}/transactions/address/:address`, async ({ params }) => {
      try {
        const address = String(params.address);
        // next_cursor is never returned: it is the only field driving the loop in
        // fetchAccountTransactionsFromHeight, and returning it hangs sync forever.
        // Every query parameter is ignored — pagination is out of scope.
        return HttpResponse.json({
          address,
          transactions: await getAccountTransactionRows(address),
        });
      } catch (error) {
        return toFailure(error);
      }
    }),

    http.get(`${V2}/transactions/:id`, async ({ params }) => {
      try {
        return HttpResponse.json(await fetchTransactionV2(String(params.id)));
      } catch (error) {
        return toFailure(error);
      }
    }),

    http.post(`${ALEO_FAKE_NODE}/prove/${ALEO_NETWORK_TYPE}/prove`, async ({ request }) => {
      try {
        const body = (await request.json()) as ProveRequestBody;
        return HttpResponse.json(await handleProve(body, expected));
      } catch (error) {
        return toFailure(error);
      }
    }),
  ];
}
