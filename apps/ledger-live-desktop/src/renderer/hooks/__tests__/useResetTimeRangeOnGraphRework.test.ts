import { renderHook } from "@testing-library/react";
import { useDispatch } from "LLD/hooks/redux";
import { useWalletFeaturesConfig } from "@features/platform-feature-flags";
import { setSelectedTimeRange } from "~/renderer/actions/settings";
import { useResetTimeRangeOnGraphRework } from "../useResetTimeRangeOnGraphRework";

jest.mock("LLD/hooks/redux");
jest.mock("@features/platform-feature-flags");

const mockDispatch = jest.fn();
const mockUseWalletFeaturesConfig = jest.mocked(useWalletFeaturesConfig);

function configWith(shouldDisplayGraphRework: boolean) {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return { shouldDisplayGraphRework } as ReturnType<typeof useWalletFeaturesConfig>;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useDispatch).mockReturnValue(mockDispatch);
});

describe("useResetTimeRangeOnGraphRework", () => {
  it("resets the selected time range to 'day' once when the graph rework is enabled", () => {
    mockUseWalletFeaturesConfig.mockReturnValue(configWith(true));

    const { rerender } = renderHook(() => useResetTimeRangeOnGraphRework());
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith(setSelectedTimeRange("day"));

    rerender();
    expect(mockDispatch).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the graph rework is disabled", () => {
    mockUseWalletFeaturesConfig.mockReturnValue(configWith(false));

    renderHook(() => useResetTimeRangeOnGraphRework());
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});
