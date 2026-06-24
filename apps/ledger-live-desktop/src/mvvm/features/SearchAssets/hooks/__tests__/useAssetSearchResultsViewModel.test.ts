import { renderHook } from "tests/testSetup";
import { setEnv } from "@ledgerhq/live-env";
import { useAssetsData } from "@ledgerhq/live-common/dada-client/hooks/useAssetsData";
import { useAssetSearchResultsViewModel } from "../useAssetSearchResultsViewModel";

jest.mock("@ledgerhq/live-common/dada-client/hooks/useAssetsData");
jest.mock("@ledgerhq/live-common/counterValues/hooks/useUsdToFiatRate", () => ({
  useUsdToFiatRate: () => ({ rate: 1, status: "ready" }),
}));

const mockedAssets = jest.mocked(useAssetsData);

describe("useAssetSearchResultsViewModel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAssets.mockReturnValue({ data: undefined, isLoading: false } as never);
  });

  afterEach(() => {
    setEnv("MANAGER_DEV_MODE", false);
  });

  it("excludes testnets from the query by default", () => {
    renderHook(() => useAssetSearchResultsViewModel({ search: "btc" }));

    expect(mockedAssets).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "btc", includeTestNetworks: false }),
    );
  });

  it("includes testnets in the query only in developer mode", () => {
    setEnv("MANAGER_DEV_MODE", true);

    renderHook(() => useAssetSearchResultsViewModel({ search: "btc" }));

    expect(mockedAssets).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeTestNetworks: true }),
    );
  });
});
