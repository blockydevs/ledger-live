import { initMswHandlers } from "./indexer";
import { FAKE_HGRAPH_URL, LOCAL_MIRROR_NODE_PORT } from "./fixtures";
import { registerErc20Token, resetErc20Tokens } from "./hgraphFake";

// This file tests msw wiring only — routing, the query/variables cross-check, and the
// mirror-node-failure fallback. Mapping correctness (balances/transfers/timestamp shapes) is
// covered by hgraphFake.test.ts and must not be duplicated here.

describe("initMswHandlers", () => {
  let close: () => void;

  afterEach(() => {
    close?.();
    resetErc20Tokens();
  });

  it("answers getLatestIndexedConsensusTimestamp with a non-empty ethereum_transaction row", async () => {
    close = initMswHandlers();

    const res = await fetch(FAKE_HGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "query LatestTransaction { ethereum_transaction(limit: 1) { consensus_timestamp } }",
      }),
    });
    const body = await res.json();

    expect(body.data.ethereum_transaction).toHaveLength(1);
    expect(body.data.ethereum_transaction[0].consensus_timestamp).toBeDefined();
  });

  it("routes a request with { accountId } variables to the erc_token_account branch", async () => {
    close = initMswHandlers();

    const res = await fetch(FAKE_HGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "query GetAccountPortfolio($accountId: bigint!) { erc_token_account { token_id } }",
        variables: { accountId: "1002" },
      }),
    });
    const body = await res.json();

    expect(body).toEqual({ data: { erc_token_account: [] } });
  });

  it("routes a request with { tokenEvmAddresses } variables to the erc_token_transfer branch, and lets a guard error propagate loudly instead of swallowing it", async () => {
    close = initMswHandlers();

    // No refresh() has run, so hgraphFake throws its "queried before refresh()" guard, which the
    // handler must rethrow rather than swallow into an empty response.
    const res = await fetch(FAKE_HGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query:
          "query GetAccountTransfers($accountId: bigint!, $tokenEvmAddresses: [String!]!, $limit: Int!) { erc_token_transfer { token_id } }",
        variables: { accountId: "1002", tokenEvmAddresses: ["0xabc"], limit: 100 },
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.message).toMatch(
      /erc_token_transfer queried before refresh\(\) populated a snapshot/,
    );
  });

  it("returns a well-formed empty erc_token_account response when the mirror node fetch fails", async () => {
    close = initMswHandlers();
    // No Solo cluster is running here, so this balance lookup hits a real, unmocked mirror-node
    // port and fails with a genuine connection error.
    registerErc20Token("0.0.5005", "0x1111111111111111111111111111111111111111");

    const res = await fetch(FAKE_HGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "query GetAccountPortfolio($accountId: bigint!) { erc_token_account { token_id } }",
        variables: { accountId: "1002" },
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ data: { erc_token_account: [] } });
  });

  it("throws a named routing-mismatch error when the query text doesn't match the picked branch", async () => {
    close = initMswHandlers();

    const res = await fetch(FAKE_HGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // variables look like the erc_token_account branch, but the query text names none of it.
        query: "query Unrelated { something { field } }",
        variables: { accountId: "1002" },
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.message).toMatch(/routed this request to hgraphFake's "erc_token_account" branch/);
  });

  it("rejects a localhost request on a non-mirror-node port instead of waving it through", async () => {
    close = initMswHandlers();
    const otherPort = `${Number(LOCAL_MIRROR_NODE_PORT) + 1}`;

    const res = await fetch(`http://127.0.0.1:${otherPort}/anything`);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.message).toMatch(/Unhandled MSW request/);
  });
});
