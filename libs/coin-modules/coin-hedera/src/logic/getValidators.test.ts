import { apiClient } from "../network/api";
import { getMockedCurrency } from "../test/fixtures/currency.fixture";
import { getValidators } from "./getValidators";

jest.mock("../network/api");

describe("getValidators", () => {
  const mockCurrency = getMockedCurrency();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return formatted validators with APY", async () => {
    (apiClient.getNodes as jest.Mock).mockResolvedValue({
      nodes: [
        {
          node_id: 1,
          node_account_id: "0.0.3",
          description: "Hosted by Ledger | Paris, France",
          stake: 1000000,
          reward_rate_start: 3538,
        },
      ],
      nextCursor: null,
    });

    const result = await getValidators({ configOrCurrencyId: mockCurrency.id, cursor: undefined });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: "1",
      address: "0.0.3",
      name: "Ledger",
      description: "Hosted by Ledger | Paris, France",
      balance: BigInt(1000000),
      apy: expect.any(Number),
    });
    expect(result.items[0].apy).toBeCloseTo(0.01291, 5);
  });

  it("should omit validator balance when stake is null", async () => {
    (apiClient.getNodes as jest.Mock).mockResolvedValue({
      nodes: [
        {
          node_id: 1,
          node_account_id: "0.0.3",
          description: "Hosted by Ledger | Paris, France",
          stake: null,
          reward_rate_start: 3538,
        },
      ],
      nextCursor: null,
    });

    const result = await getValidators({ configOrCurrencyId: mockCurrency.id, cursor: undefined });

    expect(result.items).toEqual([
      expect.objectContaining({
        id: "1",
        address: "0.0.3",
      }),
    ]);
    expect(result.items[0]).not.toHaveProperty("balance");
  });

  it("should skip nodes without node_account_id", async () => {
    (apiClient.getNodes as jest.Mock).mockResolvedValue({
      nodes: [
        { node_id: 1, node_account_id: null, description: "A", stake: 1, reward_rate_start: 1 },
        { node_id: 2, node_account_id: "0.0.4", description: "B", stake: 1, reward_rate_start: 1 },
      ],
      nextCursor: null,
    });

    const result = await getValidators({ configOrCurrencyId: mockCurrency.id, cursor: undefined });

    expect(result.items.map(item => item.id)).toEqual(["2"]);
  });

  it("should return empty description and name when description is null", async () => {
    (apiClient.getNodes as jest.Mock).mockResolvedValue({
      nodes: [
        {
          node_id: 1,
          node_account_id: "0.0.3",
          description: null,
          stake: 1,
          reward_rate_start: 1,
        },
      ],
      nextCursor: null,
    });

    const result = await getValidators({ configOrCurrencyId: mockCurrency.id, cursor: undefined });

    expect(result.items[0]).toMatchObject({ name: "", description: "" });
  });

  it("should return APY 0 when reward_rate_start is null", async () => {
    (apiClient.getNodes as jest.Mock).mockResolvedValue({
      nodes: [
        {
          node_id: 1,
          node_account_id: "0.0.3",
          description: "Hosted by Ledger",
          stake: 1,
          reward_rate_start: null,
        },
      ],
      nextCursor: null,
    });

    const result = await getValidators({ configOrCurrencyId: mockCurrency.id, cursor: undefined });

    expect(result.items[0].apy).toBe(0);
  });

  it("should handle pagination cursor", async () => {
    (apiClient.getNodes as jest.Mock).mockResolvedValue({
      nodes: [],
      nextCursor: "123",
    });

    const result = await getValidators({ configOrCurrencyId: mockCurrency.id, cursor: "100" });

    expect(apiClient.getNodes).toHaveBeenCalledWith({
      configOrCurrencyId: mockCurrency.id,
      cursor: "100",
      fetchAllPages: false,
    });
    expect(result.next).toBe("123");
  });
});
