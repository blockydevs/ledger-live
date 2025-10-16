import { pad } from "viem";
import network from "@ledgerhq/live-network/network";
import { getMockedERC20Transaction } from "../test/fixtures/thirdweb.fixture";
import * as thirdweb from "./thirdweb-mirror";
import { getMockResponse } from "../test/fixtures/common.fixture";

jest.mock("@ledgerhq/live-network/network");
const mockedNetwork = jest.mocked(network);

const mockedERC20Transaction = getMockedERC20Transaction();
const mockedERC20TokenAddress1 = "0x0000000000000000000000000000000000000001";
const mockedERC20TokenAddress2 = "0x0000000000000000000000000000000000000002";
const mockedTopicAddress = pad("0x0000000000000000000000000000000000000003");

describe("fetchERC20Transactions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should include 'page', 'limit=1000' and filterTopic query params", async () => {
    mockedNetwork.mockResolvedValueOnce(
      getMockResponse({
        result: {
          events: [],
          pagination: { limit: 1000, page: 1, totalCount: 0 },
        },
      }),
    );

    const params = new URLSearchParams({
      limit: "1000",
      page: "1",
      filterTopic1: mockedTopicAddress,
    });

    await thirdweb.fetchERC20Transactions(mockedERC20TokenAddress1, params);

    const requestUrl = mockedNetwork.mock.calls[0][0].url;
    expect(requestUrl).toContain("page=1");
    expect(requestUrl).toContain("limit=1000");
    expect(requestUrl).toContain(`filterTopic1=${mockedTopicAddress}`);
  });

  test("should fire only once and return single element", async () => {
    mockedNetwork.mockResolvedValueOnce(
      getMockResponse({
        result: {
          events: [mockedERC20Transaction],
          pagination: { limit: 1000, page: 1, totalCount: 1 },
        },
      }),
    );

    const params = new URLSearchParams({
      limit: "1000",
      page: "1",
      filterTopic1: mockedTopicAddress,
    });
    const result = await thirdweb.fetchERC20Transactions(mockedERC20TokenAddress1, params);

    expect(result).toHaveLength(1);
    expect(mockedNetwork).toHaveBeenCalledTimes(1);
  });

  test("should fire only once and return empty array", async () => {
    mockedNetwork.mockResolvedValueOnce(
      getMockResponse({
        result: {
          events: [],
          pagination: { limit: 1000, page: 1, totalCount: 0 },
        },
      }),
    );

    const params = new URLSearchParams({
      limit: "1000",
      page: "1",
      filterTopic1: mockedTopicAddress,
    });
    const result = await thirdweb.fetchERC20Transactions(mockedERC20TokenAddress1, params);

    expect(result).toHaveLength(0);
    expect(mockedNetwork).toHaveBeenCalledTimes(1);
  });

  test("should keep fetching if totalCount is equel to page size", async () => {
    mockedNetwork
      .mockResolvedValueOnce(
        getMockResponse({
          result: {
            events: [mockedERC20Transaction],
            pagination: { limit: "1000", totalCount: 1000 },
          },
        }),
      )
      .mockResolvedValueOnce(
        getMockResponse({
          result: {
            events: [mockedERC20Transaction],
            pagination: { limit: "1000", totalCount: 1000 },
          },
        }),
      )
      .mockResolvedValueOnce(
        getMockResponse({
          result: {
            events: [mockedERC20Transaction],
            pagination: { limit: "1000", totalCount: 50 },
          },
        }),
      );

    const params = new URLSearchParams({
      limit: "1000",
      page: "1",
      filterTopic1: mockedTopicAddress,
    });
    const result = await thirdweb.fetchERC20Transactions(mockedERC20TokenAddress1, params);

    expect(result).toHaveLength(3);
    expect(mockedNetwork).toHaveBeenCalledTimes(3);
  });
});

describe("getAccountERC20Transactions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return empty array without balance tokens list", async () => {
    const result = await thirdweb.getAccountERC20Transactions({
      address: "0.0.1234",
      tokens: [],
      since: null,
    });

    expect(result).toHaveLength(0);
  });

  it("should return exactly 2 transactions (out & in)", async () => {
    const mockFetcher = jest.fn().mockResolvedValue([mockedERC20Transaction]);

    const result = await thirdweb.getAccountERC20Transactions({
      address: "0.0.1234",
      tokens: [mockedERC20TokenAddress1],
      since: null,
      transactionFetcher: mockFetcher,
    });

    expect(result).toHaveLength(2);
    expect(mockFetcher).toHaveBeenCalledTimes(2);
  });

  it("should return exactly 4 transactions total for 2 tokens (out & in)", async () => {
    const mockFetcher = jest.fn().mockResolvedValue([mockedERC20Transaction]);

    const result = await thirdweb.getAccountERC20Transactions({
      address: "0.0.1234",
      tokens: [mockedERC20TokenAddress1, mockedERC20TokenAddress2],
      since: null,
      transactionFetcher: mockFetcher,
    });

    expect(result).toHaveLength(4);
    expect(mockFetcher).toHaveBeenCalledTimes(4);
  });

  it("should return exactly 4 transactions for single token (out & in)", async () => {
    const mockFetcher = jest
      .fn()
      .mockResolvedValue([mockedERC20Transaction, mockedERC20Transaction]);

    const result = await thirdweb.getAccountERC20Transactions({
      address: "0.0.1234",
      tokens: [mockedERC20TokenAddress1],
      since: null,
      transactionFetcher: mockFetcher,
    });

    expect(result).toHaveLength(4);
    expect(mockFetcher).toHaveBeenCalledTimes(2);
  });
});
