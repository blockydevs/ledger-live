import { LedgerAPI4xx } from "@ledgerhq/live-network/errors";
import { log } from "@ledgerhq/logs";
import BigNumber from "bignumber.js";
import hederaCoinConfig from "../config";
import { HederaAddAccountError, HederaMirrorNodeResponseError } from "../errors";
import { apiClient } from "../network/api";
import * as networkUtils from "../network/utils";
import { getMockedConfig } from "../test/fixtures/config.fixture";
import type { HederaERC20TokenBalance } from "../types";
import { getBalance } from "./getBalance";

jest.mock("@ledgerhq/logs");
jest.mock("../config");
jest.mock("../network/api");
jest.mock("../network/utils");

const mockHederaConfig = jest.mocked(hederaCoinConfig);

describe("getBalance", () => {
  const address = "0.0.12345";
  const mockConfig = { ...getMockedConfig() };
  const mockMirrorAccount = {
    balance: {
      balance: "1000000000",
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockHederaConfig.getCoinConfig.mockReturnValue(mockConfig);
  });

  it("should return native balance when only HBAR is present", async () => {
    (apiClient.getAccount as jest.Mock).mockResolvedValue(mockMirrorAccount);
    (apiClient.getAccountTokens as jest.Mock).mockResolvedValue([]);
    (networkUtils.getERC20BalancesForAccountV2 as jest.Mock).mockResolvedValue([]);

    const result = await getBalance(mockConfig, { address });

    expect(apiClient.getAccount).toHaveBeenCalledTimes(1);
    expect(apiClient.getAccount).toHaveBeenCalledWith({ configOrCurrencyId: mockConfig, address });
    expect(apiClient.getAccountTokens).toHaveBeenCalledTimes(1);
    expect(apiClient.getAccountTokens).toHaveBeenCalledWith({
      configOrCurrencyId: mockConfig,
      address,
    });
    // non-staking account: no node lookup should happen
    expect(apiClient.getNode).not.toHaveBeenCalled();
    expect(apiClient.getNodes).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        asset: { type: "native" },
        value: BigInt("1000000000"),
      },
    ]);
  });

  it("skips HTS tokens with a null token_id and keeps the others", async () => {
    (apiClient.getAccount as jest.Mock).mockResolvedValue(mockMirrorAccount);
    (apiClient.getAccountTokens as jest.Mock).mockResolvedValue([
      { token_id: null, balance: "1" },
      { token_id: "0.0.7890", balance: "5000" },
    ]);
    (networkUtils.getERC20BalancesForAccountV2 as jest.Mock).mockResolvedValue([]);

    const result = await getBalance(mockConfig, { address });

    expect(result).toEqual([
      { asset: { type: "native" }, value: BigInt("1000000000") },
      {
        value: BigInt("5000"),
        asset: { type: "hts", assetReference: "0.0.7890", assetOwner: address },
      },
    ]);
    expect(log).toHaveBeenCalledWith("coin-hedera", expect.stringContaining("token_id"));
  });

  it("should return native balance and raw token balances", async () => {
    const mockMirrorTokens = [
      {
        token_id: "0.0.7890",
        balance: "5000",
      },
    ];
    const mockERC20Balances: HederaERC20TokenBalance[] = [
      {
        contractAddress: "0x12345",
        balance: new BigNumber(100),
      },
    ];

    (apiClient.getAccount as jest.Mock).mockResolvedValue(mockMirrorAccount);
    (apiClient.getAccountTokens as jest.Mock).mockResolvedValue(mockMirrorTokens);
    (networkUtils.getERC20BalancesForAccountV2 as jest.Mock).mockResolvedValue(mockERC20Balances);

    const result = await getBalance(mockConfig, { address });

    expect(apiClient.getAccount).toHaveBeenCalledTimes(1);
    expect(apiClient.getAccount).toHaveBeenCalledWith({ configOrCurrencyId: mockConfig, address });
    expect(apiClient.getAccountTokens).toHaveBeenCalledTimes(1);
    expect(apiClient.getAccountTokens).toHaveBeenCalledWith({
      configOrCurrencyId: mockConfig,
      address,
    });
    expect(networkUtils.getERC20BalancesForAccountV2).toHaveBeenCalledTimes(1);
    expect(networkUtils.getERC20BalancesForAccountV2).toHaveBeenCalledWith({
      configOrCurrencyId: mockConfig,
      address,
    });
    expect(result).toEqual(
      expect.arrayContaining([
        {
          asset: { type: "native" },
          value: BigInt("1000000000"),
        },
        {
          value: BigInt("5000"),
          asset: {
            type: "hts",
            assetReference: "0.0.7890",
            assetOwner: address,
          },
        },
        {
          value: BigInt("100"),
          asset: {
            type: "erc20",
            assetReference: "0x12345",
            assetOwner: address,
          },
        },
      ]),
    );
  });

  it("should return stake", async () => {
    const mockMirrorAccount = {
      account: address,
      staked_node_id: 5,
      balance: {
        balance: 100,
      },
      pending_reward: 100,
    };
    const mockMirrorNode = {
      node_id: 5,
      node_account_id: "0.0.5",
      description: "Hosted for Wipro | Amsterdam, Netherlands",
      max_stake: 45000000000000000,
      stake: 45000000000000000,
    };

    (apiClient.getAccount as jest.Mock).mockResolvedValue(mockMirrorAccount);
    (apiClient.getAccountTokens as jest.Mock).mockResolvedValue([]);
    (apiClient.getNode as jest.Mock).mockResolvedValue(mockMirrorNode);
    (networkUtils.getERC20BalancesForAccountV2 as jest.Mock).mockResolvedValue([]);

    const result = await getBalance(mockConfig, { address });

    expect(apiClient.getAccount).toHaveBeenCalledTimes(1);
    expect(apiClient.getAccount).toHaveBeenCalledWith({ configOrCurrencyId: mockConfig, address });
    expect(apiClient.getNode).toHaveBeenCalledTimes(1);
    expect(apiClient.getNode).toHaveBeenCalledWith({
      configOrCurrencyId: mockConfig,
      nodeId: mockMirrorAccount.staked_node_id,
    });
    expect(apiClient.getNodes).not.toHaveBeenCalled();
    expect(result).toMatchObject([
      {
        asset: { type: "native" },
        value: BigInt(mockMirrorAccount.balance.balance),
        stake: {
          uid: address,
          address,
          asset: { type: "native" },
          state: "active",
          amount: BigInt(mockMirrorAccount.balance.balance + mockMirrorAccount.pending_reward),
          amountDeposited: BigInt(mockMirrorAccount.balance.balance),
          amountRewarded: BigInt(mockMirrorAccount.pending_reward),
          delegate: mockMirrorNode.node_account_id,
        },
      },
    ]);
  });

  it("should use 0 for the reward when pending_reward is missing", async () => {
    (apiClient.getAccount as jest.Mock).mockResolvedValue({
      account: address,
      staked_node_id: 5,
      balance: { balance: 100 },
    });
    (apiClient.getAccountTokens as jest.Mock).mockResolvedValue([]);
    (apiClient.getNode as jest.Mock).mockResolvedValue({
      node_id: 5,
      node_account_id: "0.0.5",
      max_stake: 45000000000000000,
      stake: 45000000000000000,
    });
    (networkUtils.getERC20BalancesForAccountV2 as jest.Mock).mockResolvedValue([]);

    const result = await getBalance(mockConfig, { address });

    expect(result[0]).toMatchObject({
      value: 100n,
      stake: { amount: 100n, amountDeposited: 100n, amountRewarded: 0n },
    });
  });

  it.each([
    ["balance", null],
    ["balance.balance", { balance: null }],
  ])("should throw HederaMirrorNodeResponseError when %s is null", async (path, balance) => {
    (apiClient.getAccount as jest.Mock).mockResolvedValue({ account: address, balance });
    (apiClient.getAccountTokens as jest.Mock).mockResolvedValue([]);
    (networkUtils.getERC20BalancesForAccountV2 as jest.Mock).mockResolvedValue([]);

    const promise = getBalance(mockConfig, { address });

    await expect(promise).rejects.toBeInstanceOf(HederaMirrorNodeResponseError);
    await expect(promise).rejects.toThrow(`"${path}"`);
  });

  it("should return stake without overstaked status when validator stake is null", async () => {
    const mockMirrorAccount = {
      account: address,
      staked_node_id: 5,
      balance: { balance: 100 },
      pending_reward: 100,
    };
    const mockMirrorNode = {
      node_id: 5,
      node_account_id: "0.0.5",
      description: "Hosted for Wipro | Amsterdam, Netherlands",
      max_stake: 45000000000000000,
      stake: null,
    };

    (apiClient.getAccount as jest.Mock).mockResolvedValue(mockMirrorAccount);
    (apiClient.getAccountTokens as jest.Mock).mockResolvedValue([]);
    (apiClient.getNode as jest.Mock).mockResolvedValue(mockMirrorNode);
    (networkUtils.getERC20BalancesForAccountV2 as jest.Mock).mockResolvedValue([]);

    const result = await getBalance(mockConfig, { address });

    expect(result[0]?.stake?.details?.overstaked).toBeNull();
  });

  it("should return all token balances without CAL filtering", async () => {
    const mockMirrorTokens = [
      {
        token_id: "0.0.7890",
        balance: "5000",
      },
      {
        token_id: "0.0.9876",
        balance: "10000",
      },
    ];
    const mockERC20Balances: HederaERC20TokenBalance[] = [
      {
        contractAddress: "0x12345",
        balance: new BigNumber(100),
      },
      {
        contractAddress: "0x54321",
        balance: new BigNumber(200),
      },
    ];

    (apiClient.getAccount as jest.Mock).mockResolvedValue(mockMirrorAccount);
    (apiClient.getAccountTokens as jest.Mock).mockResolvedValue(mockMirrorTokens);
    (networkUtils.getERC20BalancesForAccountV2 as jest.Mock).mockResolvedValue(mockERC20Balances);

    const result = await getBalance(mockConfig, { address });

    expect(result).toEqual(
      expect.arrayContaining([
        { asset: { type: "native" }, value: BigInt("1000000000") },
        expect.objectContaining({
          asset: { type: "hts", assetReference: "0.0.7890", assetOwner: address },
        }),
        expect.objectContaining({
          asset: { type: "hts", assetReference: "0.0.9876", assetOwner: address },
        }),
        expect.objectContaining({
          asset: { type: "erc20", assetReference: "0x12345", assetOwner: address },
        }),
        expect.objectContaining({
          asset: { type: "erc20", assetReference: "0x54321", assetOwner: address },
        }),
      ]),
    );
  });

  it("should throw when failing to getAccount data", async () => {
    const error = new Error("Network error");

    (apiClient.getAccount as jest.Mock).mockRejectedValue(error);
    (apiClient.getAccountTokens as jest.Mock).mockResolvedValue([]);
    (networkUtils.getERC20BalancesForAccountV2 as jest.Mock).mockResolvedValue([]);

    await expect(getBalance(mockConfig, { address })).rejects.toThrow(error);
  });

  it("should throw when failing to getAccountTokens data", async () => {
    const error = new Error("Network error");

    (apiClient.getAccount as jest.Mock).mockResolvedValue(mockMirrorAccount);
    (apiClient.getAccountTokens as jest.Mock).mockRejectedValue(error);
    (networkUtils.getERC20BalancesForAccountV2 as jest.Mock).mockResolvedValue([]);

    await expect(getBalance(mockConfig, { address })).rejects.toThrow(error);
  });

  it("should throw when failing to fetch ERC20 balances", async () => {
    const error = new Error("Network error");

    (apiClient.getAccount as jest.Mock).mockResolvedValue(mockMirrorAccount);
    (apiClient.getAccountTokens as jest.Mock).mockResolvedValue([]);
    (networkUtils.getERC20BalancesForAccountV2 as jest.Mock).mockRejectedValue(error);

    await expect(getBalance(mockConfig, { address })).rejects.toThrow(error);
  });

  it.each([
    {
      name: "HederaAddAccountError",
      error: new HederaAddAccountError(),
    },
    {
      name: "404 error",
      error: new LedgerAPI4xx("", { status: 404, url: undefined, method: "GET" }),
    },
  ])("should return empty results on $name", async ({ error }) => {
    const address = "0.0.0";

    (apiClient.getAccount as jest.Mock).mockRejectedValue(error);
    (apiClient.getAccountTokens as jest.Mock).mockResolvedValue([]);
    (networkUtils.getERC20BalancesForAccountV2 as jest.Mock).mockResolvedValue([]);

    const result = await getBalance(mockConfig, { address });

    expect(apiClient.getAccount).toHaveBeenCalledTimes(1);
    expect(apiClient.getAccount).toHaveBeenCalledWith({ configOrCurrencyId: mockConfig, address });
    expect(result).toEqual([]);
  });
});
