import { renderHook, withFlagOverrides } from "tests/testSetup";
import { setEnv } from "@ledgerhq/live-env";
import { useAssetsData } from "@ledgerhq/live-common/dada-client/hooks/useAssetsData";
import { useAssetSearchResultsViewModel } from "../useAssetSearchResultsViewModel";

jest.mock("@ledgerhq/live-common/dada-client/hooks/useAssetsData");
jest.mock("@ledgerhq/live-common/counterValues/hooks/useUsdToFiatRate", () => ({
  useUsdToFiatRate: () => ({ rate: 1, status: "ready" }),
}));

const mockedAssets = jest.mocked(useAssetsData);

const buildAssetsData = (
  overrides: Partial<ReturnType<typeof useAssetsData>> = {},
): ReturnType<typeof useAssetsData> =>
  ({
    data: undefined,
    isLoading: false,
    isFetchingNextPage: false,
    error: undefined,
    errorInfo: undefined,
    loadNext: undefined,
    isSuccess: true,
    isError: false,
    refetch: jest.fn(),
    ...overrides,
  }) as ReturnType<typeof useAssetsData>;

describe("useAssetSearchResultsViewModel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setEnv("MANAGER_DEV_MODE", false);
    mockedAssets.mockReturnValue(buildAssetsData());
  });

  afterEach(() => {
    setEnv("MANAGER_DEV_MODE", false);
  });

  it("excludes testnets and uses the prod environment by default", () => {
    renderHook(() => useAssetSearchResultsViewModel({ search: "btc" }));

    expect(mockedAssets).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "btc", includeTestNetworks: false, isStaging: false }),
    );
  });

  it("includes testnets in the query only in developer mode", () => {
    setEnv("MANAGER_DEV_MODE", true);

    renderHook(() => useAssetSearchResultsViewModel({ search: "btc" }));

    expect(mockedAssets).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeTestNetworks: true }),
    );
  });

  it("derives isStaging from the lldModularDrawer backend environment", () => {
    renderHook(() => useAssetSearchResultsViewModel({ search: "btc" }), {
      initialState: withFlagOverrides({
        lldModularDrawer: { enabled: true, params: { backendEnvironment: "STAGING" } },
      }),
    });

    expect(mockedAssets).toHaveBeenLastCalledWith(expect.objectContaining({ isStaging: true }));
  });
});
