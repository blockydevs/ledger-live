import { renderHook, waitFor } from "@tests/test-renderer";
import { lastBlock } from "@ledgerhq/live-common/families/aleo/logic";
import { getCurrencyConfiguration } from "@ledgerhq/live-common/config/index";
import { aleoCurrency } from "../../__mocks__/currency.mock";
import { useAleoLiveBlockHeight } from "../useAleoLiveBlockHeight";

jest.mock("@ledgerhq/live-common/families/aleo/logic", () => ({ lastBlock: jest.fn() }));
jest.mock("@ledgerhq/live-common/config/index", () => ({ getCurrencyConfiguration: jest.fn() }));

const mockLastBlock = jest.mocked(lastBlock);
const mockGetCurrencyConfiguration = jest.mocked(getCurrencyConfiguration);

describe("useAleoLiveBlockHeight", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrencyConfiguration.mockReturnValue({
      networkType: "mainnet",
    } as ReturnType<typeof getCurrencyConfiguration>);
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

    await waitFor(() => expect(result.current).toBe(140));
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
});
