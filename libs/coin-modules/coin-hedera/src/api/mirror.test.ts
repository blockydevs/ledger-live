import BigNumber from "bignumber.js";
import network from "@ledgerhq/live-network/network";
import {
  estimateContractCallGas,
  getAccount,
  getAccountTokens,
  getAccountTransactions,
  getERC20TokenBalance,
  getContractCallResult,
  getMirrorTransactionForContractCallResult,
  getNetworkFees,
} from "./mirror";
import {
  HederaMirrorContractCallResult,
  HederaMirrorNetworkFees,
  HederaMirrorTransaction,
} from "./types";
import { getMockResponse } from "../test/fixtures/common.fixture";

jest.mock("@ledgerhq/live-network/network");
const mockedNetwork = jest.mocked(network);

describe("getAccountTransactions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should include 'account.id', 'limit=100' and 'order=desc' query params", async () => {
    mockedNetwork.mockResolvedValueOnce(
      getMockResponse({ transactions: [], links: { next: null } }),
    );

    await getAccountTransactions("0.0.1234", null);

    const requestUrl = mockedNetwork.mock.calls[0][0].url;
    expect(requestUrl).toContain("account.id=0.0.1234");
    expect(requestUrl).toContain("limit=100");
    expect(requestUrl).toContain("order=desc");
  });

  test("should keep fetching if links.next is present", async () => {
    mockedNetwork
      .mockResolvedValueOnce(
        getMockResponse({
          transactions: [{ consensus_timestamp: "1" }],
          links: { next: "/next-1" },
        }),
      )
      .mockResolvedValueOnce(
        getMockResponse({
          transactions: [],
          links: { next: "/next-2" },
        }),
      )
      .mockResolvedValueOnce(
        getMockResponse({
          transactions: [{ consensus_timestamp: "3" }],
          links: { next: "/next-3" },
        }),
      )
      .mockResolvedValueOnce(
        getMockResponse({
          transactions: [],
          links: { next: "/next-4" },
        }),
      )
      .mockResolvedValueOnce(
        getMockResponse({
          transactions: [],
          links: { next: null },
        }),
      );

    const result = await getAccountTransactions("0.0.1234", null);

    expect(result).toHaveLength(2);
    expect(result.map(tx => tx.consensus_timestamp)).toEqual(["1", "3"]);
    expect(mockedNetwork).toHaveBeenCalledTimes(5);
  });
});

describe("getAccount", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should call the correct endpoint and return account data", async () => {
    mockedNetwork.mockResolvedValueOnce(
      getMockResponse({
        account: "0.0.1234",
        max_automatic_token_associations: 0,
        balance: {
          balance: 1000,
          timestamp: "1749047764.000113442",
          tokens: [],
        },
      }),
    );

    const result = await getAccount("0.0.1234");
    const requestUrl = mockedNetwork.mock.calls[0][0].url;

    expect(result.account).toEqual("0.0.1234");
    expect(requestUrl).toContain("/api/v1/accounts/0.0.1234");
    expect(mockedNetwork).toHaveBeenCalledTimes(1);
  });
});

describe("getAccountTokens", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return all tokens if only one page is needed", async () => {
    mockedNetwork.mockResolvedValueOnce(
      getMockResponse({
        tokens: [
          { token_id: "0.0.1001", balance: 10 },
          { token_id: "0.0.1002", balance: 20 },
        ],
        links: { next: null },
      }),
    );

    const result = await getAccountTokens("0.0.1234");
    const requestUrl = mockedNetwork.mock.calls[0][0].url;

    expect(result.map(t => t.token_id)).toEqual(["0.0.1001", "0.0.1002"]);
    expect(requestUrl).toContain("/api/v1/accounts/0.0.1234/tokens");
    expect(requestUrl).toContain("limit=100");
    expect(mockedNetwork).toHaveBeenCalledTimes(1);
  });

  it("should keep fetching if links.next is present and new tokens are returned", async () => {
    mockedNetwork
      .mockResolvedValueOnce(
        getMockResponse({
          tokens: [{ token_id: "0.0.1001", balance: 10 }],
          links: { next: "/next-1" },
        }),
      )
      .mockResolvedValueOnce(
        getMockResponse({
          tokens: [{ token_id: "0.0.1002", balance: 20 }],
          links: { next: null },
        }),
      );

    const result = await getAccountTokens("0.0.1234");

    expect(result.map(t => t.token_id)).toEqual(["0.0.1001", "0.0.1002"]);
    expect(mockedNetwork).toHaveBeenCalledTimes(2);
  });

  describe("getNetworkFees", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it("should call the correct endpoint and return network fees", async () => {
      const mockedResults: HederaMirrorNetworkFees = {
        fees: [{ gas: 39, transaction_type: "ContractCall" }],
        timestamp: "1758733200.632122898",
      };

      mockedNetwork.mockResolvedValueOnce(getMockResponse(mockedResults));

      const result = await getNetworkFees();
      const requestUrl = mockedNetwork.mock.calls[0][0].url;

      expect(result).toEqual(mockedResults);
      expect(requestUrl).toContain("/api/v1/network/fees");
      expect(mockedNetwork).toHaveBeenCalledTimes(1);
    });
  });

  describe("getContractCallResult", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it("should call the correct endpoint and return results for contract call", async () => {
      const mockedResults: HederaMirrorContractCallResult = {
        contract_id: "0.0.4321",
        block_gas_used: 100,
        gas_consumed: 200,
        gas_limit: 10000,
        gas_used: 150,
        timestamp: "xxxxxxxxx",
      };

      mockedNetwork.mockResolvedValueOnce(
        getMockResponse({
          contract_id: "0.0.4321",
          block_gas_used: 100,
          gas_consumed: 200,
          gas_limit: 10000,
          gas_used: 150,
          timestamp: "xxxxxxxxx",
        }),
      );

      const result = await getContractCallResult(
        "0xa9059cbb000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000186a0",
      );
      const requestUrl = mockedNetwork.mock.calls[0][0].url;

      expect(result).toEqual(mockedResults);
      expect(requestUrl).toContain("/api/v1/contracts/results");
      expect(mockedNetwork).toHaveBeenCalledTimes(1);
    });
  });

  describe("getMirrorTransactionForContractCallResult", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it("should call the correct endpoint and return transaction details", async () => {
      const mockedResults: HederaMirrorTransaction = {
        transfers: [],
        token_transfers: [],
        charged_tx_fee: 100,
        transaction_id: "xxxxxxxxxxxxxx",
        transaction_hash: "xxxxxxxxxxxxx",
        consensus_timestamp: "xxxxxxxxxxxxx",
        result: "xxxxxxxxxxxxx",
        entity_id: "0.0.1234",
        name: "CONTRACTCALL",
      };

      mockedNetwork.mockResolvedValueOnce(
        getMockResponse({
          transactions: [mockedResults],
        }),
      );

      const result = await getMirrorTransactionForContractCallResult(
        "xxxxxxxxxxxxxxxxxxxx",
        "0.0.1234",
      );
      const requestUrl = mockedNetwork.mock.calls[0][0].url;

      expect(result).toEqual(mockedResults);
      expect(requestUrl).toContain("/api/v1/transactions?timestamp=");
      expect(mockedNetwork).toHaveBeenCalledTimes(1);
    });

    it("should call the correct endpoint and return null for non existing contract calls", async () => {
      mockedNetwork.mockResolvedValueOnce(
        getMockResponse({
          transactions: [
            {
              transfers: [],
              token_transfers: [],
              charged_tx_fee: 100,
              transaction_hash: "xxxxxxxxxxxxx",
              consensus_timestamp: "xxxxxxxxxxxxx",
              result: "xxxxxxxxxxxxx",
              entity_id: "0.0.1234",
              name: "NOT_CONTRACTCALL",
            },
            {
              transfers: [],
              token_transfers: [],
              charged_tx_fee: 100,
              transaction_hash: "xxxxxxxxxxxxx",
              consensus_timestamp: "xxxxxxxxxxxxx",
              result: "xxxxxxxxxxxxx",
              entity_id: "0.0.1111",
              name: "CONTRACTCALL",
            },
          ],
        }),
      );

      const result = await getMirrorTransactionForContractCallResult(
        "xxxxxxxxxxxxxxxxxxxx",
        "0.0.1234",
      );
      const requestUrl = mockedNetwork.mock.calls[0][0].url;

      expect(result).toEqual(null);
      expect(requestUrl).toContain("/api/v1/transactions?timestamp=");
      expect(mockedNetwork).toHaveBeenCalledTimes(1);
    });

    it("should call the correct endpoint and return null for empty transactions list", async () => {
      mockedNetwork.mockResolvedValueOnce(
        getMockResponse({
          transactions: [],
        }),
      );

      const result = await getMirrorTransactionForContractCallResult(
        "xxxxxxxxxxxxxxxxxxxx",
        "0.0.1234",
      );
      const requestUrl = mockedNetwork.mock.calls[0][0].url;

      expect(result).toEqual(null);
      expect(requestUrl).toContain("/api/v1/transactions?timestamp=");
      expect(mockedNetwork).toHaveBeenCalledTimes(1);
    });
  });

  describe("getERC20TokenBalance", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it("should call the correct endpoint and return the contract balance", async () => {
      mockedNetwork.mockResolvedValueOnce(
        getMockResponse({
          result: "1000000000",
        }),
      );

      const result = await getERC20TokenBalance(
        "0x0000000000000000000000000000000000000001",
        "0x0000000000000000000000000000000000000002",
      );
      const requestUrl = mockedNetwork.mock.calls[0][0].url;

      expect(result).toEqual(BigNumber("1000000000"));
      expect(requestUrl).toContain("/api/v1/contracts/call");
      expect(mockedNetwork).toHaveBeenCalledTimes(1);
    });
  });

  describe("estimateContractCallGas", () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it("should call the correct endpoint and return estimated contract call gas", async () => {
      mockedNetwork.mockResolvedValueOnce(
        getMockResponse({
          result: "1000000000",
        }),
      );

      const result = await estimateContractCallGas(
        "0x0000000000000000000000000000000000000001",
        "0x0000000000000000000000000000000000000002",
        "0xa9059cbb000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000186a0",
        BigInt(1000),
      );
      const requestUrl = mockedNetwork.mock.calls[0][0].url;

      expect(result).toEqual(BigNumber("1000000000"));
      expect(requestUrl).toContain("/api/v1/contracts/call");
      expect(mockedNetwork).toHaveBeenCalledTimes(1);
    });
  });
});
