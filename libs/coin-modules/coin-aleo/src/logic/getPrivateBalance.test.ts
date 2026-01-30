import BigNumber from "bignumber.js";
import { apiClient } from "../network/api";
import { AleoPrivateTransaction } from "../types/api";
import { sdkClient } from "../network/sdk";
import { createMockRecord } from "../test/fixtures/api.fixture";
import { getPrivateBalance } from "./getPrivateBalance";

jest.mock("../network/api");
jest.mock("../network/sdk");

const mockDecryptRecord = sdkClient.decryptRecord as jest.MockedFunction<
  typeof sdkClient.decryptRecord
>;
const mockGetAccountOwnedRecords = apiClient.getAccountOwnedRecords as jest.MockedFunction<
  typeof apiClient.getAccountOwnedRecords
>;

describe("getPrivateBalance", () => {
  const mockJwtToken = "mock-jwt-token";
  const mockUuid = "mock-uuid";
  const mockApiKey = "mock-api-key";
  const mockViewKey = "mock-view-key";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return zero balance when no records exist", async () => {
    mockGetAccountOwnedRecords.mockResolvedValue([]);

    const result = await getPrivateBalance({
      jwtToken: mockJwtToken,
      uuid: mockUuid,
      apiKey: mockApiKey,
      viewKey: mockViewKey,
    });

    expect(result.balance).toEqual(new BigNumber(0));
    expect(result.records).toEqual([]);
  });

  it("should call apiClient with correct parameters", async () => {
    mockGetAccountOwnedRecords.mockResolvedValue([]);

    await getPrivateBalance({
      jwtToken: mockJwtToken,
      uuid: mockUuid,
      apiKey: mockApiKey,
      viewKey: mockViewKey,
    });

    expect(mockGetAccountOwnedRecords).toHaveBeenCalledWith({
      jwtToken: mockJwtToken,
      apiKey: mockApiKey,
      uuid: mockUuid,
      unspent: true,
    });
    expect(mockGetAccountOwnedRecords).toHaveBeenCalledTimes(1);
  });

  it("should handle API errors when fetching records", async () => {
    mockGetAccountOwnedRecords.mockRejectedValue(new Error("API Error"));

    await expect(
      getPrivateBalance({
        jwtToken: mockJwtToken,
        uuid: mockUuid,
        apiKey: mockApiKey,
        viewKey: mockViewKey,
      }),
    ).rejects.toThrow("API Error");
  });

  it("should pass correct authentication parameters to API client", async () => {
    const customJwt = "custom-jwt";
    const customApiKey = "custom-api-key";
    const customUuid = "custom-uuid";

    mockGetAccountOwnedRecords.mockResolvedValue([]);

    await getPrivateBalance({
      jwtToken: customJwt,
      uuid: customUuid,
      apiKey: customApiKey,
      viewKey: mockViewKey,
    });

    expect(mockGetAccountOwnedRecords).toHaveBeenCalledWith({
      jwtToken: customJwt,
      apiKey: customApiKey,
      uuid: customUuid,
      unspent: true,
    });
    expect(mockGetAccountOwnedRecords).toHaveBeenCalledTimes(1);
  });

  it("should return correct asset type for all balance records", async () => {
    const mockRecords: AleoPrivateTransaction[] = [
      createMockRecord("ciphertext1"),
      createMockRecord("ciphertext2"),
    ];

    mockGetAccountOwnedRecords.mockResolvedValue(mockRecords);
    mockDecryptRecord.mockResolvedValue({ data: { microcredits: "1000000u64" } });

    const result = await getPrivateBalance({
      jwtToken: mockJwtToken,
      uuid: mockUuid,
      apiKey: mockApiKey,
      viewKey: mockViewKey,
    });

    result.records.forEach(({ program_name }) => {
      expect(program_name).toEqual("credits.aleo");
    });
  });

  it("should sum balances correctly with mixed amounts", async () => {
    const mockRecords: AleoPrivateTransaction[] = [
      createMockRecord("ciphertext1"),
      createMockRecord("ciphertext2"),
      createMockRecord("ciphertext3"),
      createMockRecord("ciphertext4"),
    ];

    mockGetAccountOwnedRecords.mockResolvedValue(mockRecords);
    mockDecryptRecord
      .mockResolvedValueOnce({ data: { microcredits: "100u64" } })
      .mockResolvedValueOnce({ data: { microcredits: "200u64" } })
      .mockResolvedValueOnce({ data: { microcredits: "0u64" } })
      .mockResolvedValueOnce({ data: { microcredits: "9999999999u64" } });

    const result = await getPrivateBalance({
      jwtToken: mockJwtToken,
      uuid: mockUuid,
      apiKey: mockApiKey,
      viewKey: mockViewKey,
    });

    expect(result.balance).toEqual(new BigNumber(10000000299));
    expect(result.records).toEqual([
      expect.objectContaining({ record_ciphertext: "ciphertext1" }),
      expect.objectContaining({ record_ciphertext: "ciphertext2" }),
      expect.objectContaining({ record_ciphertext: "ciphertext3" }),
      expect.objectContaining({ record_ciphertext: "ciphertext4" }),
    ]);
  });
});
