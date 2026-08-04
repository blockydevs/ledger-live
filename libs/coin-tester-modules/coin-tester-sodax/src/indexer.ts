import type { AccountType, IconTransactionType } from "@ledgerhq/coin-icon/api/api-type";
import { convertLoopToIcx } from "@ledgerhq/coin-icon/logic";
import BigNumber from "bignumber.js";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { INDEXER_URL } from "./fixtures";
import { rpc } from "./helpers";

// goloop indexes transactions by hash only. The tracker serves history per
// address, so the double keeps its own list of hashes the suite submitted.
const submittedHashes: string[] = [];

export function registerTransaction(hash: string): void {
  submittedHashes.push(hash);
}

async function toTrackerTransaction(hash: string): Promise<IconTransactionType> {
  const [transaction, receipt] = await Promise.all([
    rpc.getTransaction(hash).execute(),
    rpc.getTransactionResult(hash).execute(),
  ]);
  const valueLoop = transaction.value ?? new BigNumber(0);
  const feeLoop = receipt.stepUsed.multipliedBy(receipt.stepPrice);

  return {
    block_number: receipt.blockHeight,
    // api/index.ts divides by 1000, so this field is microseconds.
    block_timestamp: transaction.timestamp,
    data: "",
    from_address: transaction.from,
    hash: receipt.txHash,
    method: "",
    // api/index.ts marks an operation failed when status !== "0x1".
    status: `0x${new BigNumber(receipt.status).toString(16)}`,
    to_address: transaction.to,
    // Hex loop string. api/index.ts feeds it to BigNumber with no conversion.
    transaction_fee: `0x${feeLoop.toString(16)}`,
    transaction_type: 0,
    type: 0,
    // Hex loop string, same rule as transaction_fee.
    value: `0x${valueLoop.toString(16)}`,
    value_decimal: convertLoopToIcx(valueLoop).toNumber(),
  };
}

const handlers = [
  // getCurrentBlockHeight reads [0].number.
  http.get(`${INDEXER_URL}/blocks`, async () => {
    const block = await rpc.getLastBlock().execute();
    return HttpResponse.json([{ number: block.height }]);
  }),

  http.get(`${INDEXER_URL}/addresses/details/:address`, async ({ params }) => {
    const address = params.address as string;
    const [balanceLoop, block] = await Promise.all([
      rpc.getBalance(address).execute(),
      rpc.getLastBlock().execute(),
    ]);

    // balance is an ICX decimal number here. getAccountShape calls
    // convertICXtoLoop on it.
    const account: AccountType = {
      address,
      audit_tx_hash: "",
      balance: convertLoopToIcx(balanceLoop).toNumber(),
      code_hash: "",
      contract_type: "",
      contract_updated_block: block.height,
      created_timestamp: 0,
      deploy_tx_hash: "",
      is_contract: false,
      is_nft: false,
      is_prep: false,
      is_token: false,
      log_count: 0,
      name: "",
      owner: "",
      status: "0x1",
      symbol: "",
      token_standard: "",
      token_transfer_count: 0,
      transaction_count: submittedHashes.length,
      transaction_internal_count: 0,
      type: "EOA",
    };
    return HttpResponse.json(account);
  }),

  http.get(`${INDEXER_URL}/transactions/address/:address`, async ({ params, request }) => {
    const address = params.address as string;
    const url = new URL(request.url);
    const skip = Number(url.searchParams.get("skip") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 100);

    const all = await Promise.all(submittedHashes.map(toTrackerTransaction));
    const mine = all
      .filter(
        transaction => transaction.from_address === address || transaction.to_address === address,
      )
      // skip === 0 is the newest transaction, matching the real tracker.
      .reverse();
    return HttpResponse.json(mine.slice(skip, skip + limit));
  }),
];

export function initIndexer(): () => void {
  const server = setupServer(...handlers);
  server.listen({
    onUnhandledRequest: request => {
      const hostname = new URL(request.url).hostname;
      if (["127.0.0.1", "localhost"].includes(hostname)) return;
      throw new Error(`Unhandled request: ${request.method} ${request.url}`);
    },
  });
  return () => server.close();
}
