import network from "@ledgerhq/live-network/network";
import { getCryptoCurrencyById } from "@ledgerhq/cryptoassets";
import { fetchAllTransactionsByPaymentKey } from "./getTransactionsByPaymentKey";

jest.mock("@ledgerhq/live-network/network");
const mockNetwork = jest.mocked(network);

const currency = getCryptoCurrencyById("cardano");

function page(hashes: string[], limit: number) {
  return {
    data: { transactions: hashes.map(hash => ({ hash })), limit },
  } as never;
}

describe("fetchAllTransactionsByPaymentKey", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("walks all pages until a short page ends the sequence", async () => {
    mockNetwork
      .mockResolvedValueOnce(page(["a", "b"], 2)) // full page -> keep going
      .mockResolvedValueOnce(page(["c"], 2)); // short page -> stop

    const txs = await fetchAllTransactionsByPaymentKey("pk", currency);

    expect(txs.map(t => t.hash)).toEqual(["a", "b", "c"]);
    expect(mockNetwork).toHaveBeenCalledTimes(2);
    expect(mockNetwork.mock.calls[0][0]).toMatchObject({
      method: "POST",
      data: { paymentKeys: ["pk"], pageNo: 1, blockHeight: 0 },
    });
    expect(mockNetwork.mock.calls[1][0]).toMatchObject({ data: { pageNo: 2 } });
  });

  it("stops after a single full page when the next page is empty", async () => {
    mockNetwork.mockResolvedValueOnce(page(["a", "b"], 2)).mockResolvedValueOnce(page([], 2));

    const txs = await fetchAllTransactionsByPaymentKey("pk", currency);

    expect(txs.map(t => t.hash)).toEqual(["a", "b"]);
    expect(mockNetwork).toHaveBeenCalledTimes(2);
  });

  it("stops immediately when the API advertises no limit (avoids an unbounded loop)", async () => {
    mockNetwork.mockResolvedValueOnce(page(["a"], 0));

    const txs = await fetchAllTransactionsByPaymentKey("pk", currency);

    expect(txs.map(t => t.hash)).toEqual(["a"]);
    expect(mockNetwork).toHaveBeenCalledTimes(1);
  });
});
