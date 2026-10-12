import { HederaMirrorNodeResponseError } from "../errors";
import { apiClient } from "../network/api";
import { getMockedConfig } from "../test/fixtures/config.fixture";
import { getMockedMirrorAccount } from "../test/fixtures/mirror.fixture";
import { getAccountInfo } from "./getAccountInfo";

jest.mock("../network/api");

const mockGetAccount = jest.mocked(apiClient.getAccount);

describe("getAccountInfo", () => {
  const address = "0.0.12345";
  const mockConfig = getMockedConfig();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("fetches the mirror account once", async () => {
    mockGetAccount.mockResolvedValue(getMockedMirrorAccount());

    await getAccountInfo(mockConfig, address);

    expect(mockGetAccount).toHaveBeenCalledTimes(1);
    expect(mockGetAccount).toHaveBeenCalledWith({ configOrCurrencyId: mockConfig, address });
  });

  it("maps a staking account", async () => {
    mockGetAccount.mockResolvedValue(
      getMockedMirrorAccount({
        max_automatic_token_associations: -1,
        staked_node_id: 3,
        pending_reward: 42,
        balance: { balance: 1_000_000_000, timestamp: "1764932745.835883000", tokens: [] },
      }),
    );

    const result = await getAccountInfo(mockConfig, address);

    expect(result).toEqual({
      type: "hedera",
      maxAutomaticTokenAssociations: -1,
      stakedNodeId: 3,
      balance: 1_000_000_000,
      pendingReward: 42,
    });
  });

  it("keeps a null staked node id for a non-staking account", async () => {
    mockGetAccount.mockResolvedValue(
      getMockedMirrorAccount({ max_automatic_token_associations: 0, staked_node_id: null }),
    );

    const result = await getAccountInfo(mockConfig, address);

    expect(result).toMatchObject({ maxAutomaticTokenAssociations: 0, stakedNodeId: null });
  });

  it("keeps a null max_automatic_token_associations", async () => {
    mockGetAccount.mockResolvedValue(
      getMockedMirrorAccount({ max_automatic_token_associations: null }),
    );

    const result = await getAccountInfo(mockConfig, address);

    expect(result).toMatchObject({ maxAutomaticTokenAssociations: null });
  });

  it("uses 0 when pending_reward is missing", async () => {
    const { pending_reward: _omitted, ...account } = getMockedMirrorAccount();
    mockGetAccount.mockResolvedValue(account);

    const result = await getAccountInfo(mockConfig, address);

    expect(result).toMatchObject({ pendingReward: 0 });
  });

  it.each([
    ["balance", null],
    ["balance.balance", { balance: null, timestamp: "1764932745.835883000", tokens: [] }],
  ])("throws HederaMirrorNodeResponseError when %s is null", async (path, balance) => {
    mockGetAccount.mockResolvedValue(
      getMockedMirrorAccount({ balance } as unknown as Parameters<
        typeof getMockedMirrorAccount
      >[0]),
    );

    const promise = getAccountInfo(mockConfig, address);

    await expect(promise).rejects.toBeInstanceOf(HederaMirrorNodeResponseError);
    await expect(promise).rejects.toThrow(`"${path}"`);
  });

  it("propagates a mirror node failure", async () => {
    mockGetAccount.mockRejectedValue(new Error("mirror node down"));

    await expect(getAccountInfo(mockConfig, address)).rejects.toThrow("mirror node down");
  });
});
