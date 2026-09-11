import { act, renderHook, waitFor } from "@tests/test-renderer";
import { AppState } from "react-native";
import { lastBlock } from "@ledgerhq/live-common/families/aleo/logic";
import { getCurrencyConfiguration } from "@ledgerhq/live-common/config/index";
import { aleoCurrency } from "../../__mocks__/currency.mock";
import { LIVE_BLOCK_HEIGHT_POLL_MS } from "../../constants";
import { useAleoLiveBlockHeight } from "../useAleoLiveBlockHeight";

jest.mock("@ledgerhq/live-common/families/aleo/logic", () => ({ lastBlock: jest.fn() }));
jest.mock("@ledgerhq/live-common/config/index", () => ({ getCurrencyConfiguration: jest.fn() }));

const mockLastBlock = jest.mocked(lastBlock);
const mockGetCurrencyConfiguration = jest.mocked(getCurrencyConfiguration);

describe("useAleoLiveBlockHeight", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AppState.currentState = "active";
    mockGetCurrencyConfiguration.mockReturnValue({
      status: { type: "active" },
      networkType: "mainnet",
    } as ReturnType<typeof getCurrencyConfiguration>);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns the fallback height and fetches nothing while disabled", () => {
    const { result } = renderHook(() =>
      useAleoLiveBlockHeight(aleoCurrency, { fallbackHeight: 100, enabled: false }),
    );

    expect(result.current).toBe(100);
    expect(mockLastBlock).not.toHaveBeenCalled();
  });

  it("returns the polled height once it is ahead of the fallback", async () => {
    mockLastBlock.mockResolvedValue({ height: 140 } as Awaited<ReturnType<typeof lastBlock>>);

    const { result } = renderHook(() =>
      useAleoLiveBlockHeight(aleoCurrency, { fallbackHeight: 100, enabled: true }),
    );

    // act() flushes the state update the mount-time fetch schedules; plain waitFor()
    // polls result.current without ever pumping React's update queue, so it can spin
    // until timeout when a prior test already unmounted a tree in the same file.
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current).toBe(140);
  });

  // A synced account that overtook the last successful poll must not make the countdown grow.
  it("never returns less than the fallback height", async () => {
    mockLastBlock.mockResolvedValue({ height: 90 } as Awaited<ReturnType<typeof lastBlock>>);

    const { result } = renderHook(() =>
      useAleoLiveBlockHeight(aleoCurrency, { fallbackHeight: 100, enabled: true }),
    );

    await waitFor(() => expect(mockLastBlock).toHaveBeenCalled());
    expect(result.current).toBe(100);
  });

  it("keeps the last good height when a poll fails", async () => {
    mockLastBlock.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() =>
      useAleoLiveBlockHeight(aleoCurrency, { fallbackHeight: 100, enabled: true }),
    );

    await waitFor(() => expect(mockLastBlock).toHaveBeenCalled());
    expect(result.current).toBe(100);
  });

  it.each(["background", "inactive"] as const)(
    "pauses interval polling while the app state is %s",
    async state => {
      jest.useFakeTimers();
      mockLastBlock.mockResolvedValue({ height: 140 } as Awaited<ReturnType<typeof lastBlock>>);

      const { result } = renderHook(() =>
        useAleoLiveBlockHeight(aleoCurrency, { fallbackHeight: 100, enabled: true }),
      );

      await act(async () => {
        await Promise.resolve();
      });
      expect(result.current).toBe(140);
      mockLastBlock.mockClear();

      AppState.currentState = state;
      await act(async () => {
        await jest.advanceTimersByTimeAsync(LIVE_BLOCK_HEIGHT_POLL_MS);
      });

      expect(mockLastBlock).not.toHaveBeenCalled();
    },
  );

  it("resumes polling once the app returns to active", async () => {
    mockLastBlock.mockResolvedValue({ height: 140 } as Awaited<ReturnType<typeof lastBlock>>);

    renderHook(() => useAleoLiveBlockHeight(aleoCurrency, { fallbackHeight: 100, enabled: true }));

    await act(async () => {
      await Promise.resolve();
    });
    mockLastBlock.mockClear();

    AppState.currentState = "background";
    const onChange = jest.mocked(AppState.addEventListener).mock.calls[0][1];

    AppState.currentState = "active";
    await act(async () => {
      onChange("active");
      await Promise.resolve();
    });

    expect(mockLastBlock).toHaveBeenCalledTimes(1);
  });

  it("removes the AppState subscription on unmount", () => {
    const { unmount } = renderHook(() =>
      useAleoLiveBlockHeight(aleoCurrency, { fallbackHeight: 100, enabled: true }),
    );

    const subscription = jest.mocked(AppState.addEventListener).mock.results[0].value;
    unmount();

    expect(subscription.remove).toHaveBeenCalledTimes(1);
  });
});
