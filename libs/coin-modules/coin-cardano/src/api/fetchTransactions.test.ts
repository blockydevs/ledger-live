import { getCryptoCurrencyById } from "@ledgerhq/cryptoassets";
import network from "@ledgerhq/live-network/network";
import { getAllTransactionsByKeys } from "./fetchTransactions";

jest.mock("@ledgerhq/live-network/network");
const mockNetwork = jest.mocked(network);

const currency = getCryptoCurrencyById("cardano");

function page(hashes: string[], limit: number, blockHeight = 0) {
  return {
    data: { transactions: hashes.map(hash => ({ hash })), limit, blockHeight },
  } as never;
}

describe("getAllTransactionsByKeys", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("forwards every payment key and the blockHeight floor, walks pages, returns the max blockHeight", async () => {
    mockNetwork
      .mockResolvedValueOnce(page(["a", "b"], 2, 10)) // full page -> keep going
      .mockResolvedValueOnce(page(["c"], 2, 12)); // short page -> stop

    const res = await getAllTransactionsByKeys(["k1", "k2"], 5, currency);

    expect(res.transactions.map(t => t.hash)).toEqual(["a", "b", "c"]);
    expect(res.blockHeight).toBe(12); // max across pages
    expect(mockNetwork.mock.calls[0][0]).toMatchObject({
      method: "POST",
      data: { paymentKeys: ["k1", "k2"], pageNo: 1, blockHeight: 5 },
    });
    expect(mockNetwork.mock.calls[1][0]).toMatchObject({ data: { pageNo: 2 } });
  });

  it("stops immediately when the API advertises no limit (avoids an unbounded loop)", async () => {
    mockNetwork.mockResolvedValueOnce(page(["a"], 0, 3));

    const res = await getAllTransactionsByKeys(["k"], 0, currency);

    expect(res.transactions).toHaveLength(1);
    expect(res.blockHeight).toBe(3);
    expect(mockNetwork).toHaveBeenCalledTimes(1);
  });
});
