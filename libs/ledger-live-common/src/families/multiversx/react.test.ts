/**
 * @jest-environment jsdom
 */
import "../../__tests__/test-helpers/dom-polyfill";
import { Subject } from "rxjs";
import type { MultiversXPreloadData, MultiversXProvider } from "@ledgerhq/coin-multiversx/types";

const mockPreloadUpdates = new Subject<MultiversXPreloadData>();
let mockCurrentPreload: MultiversXPreloadData = { validators: [] };
jest.mock("@ledgerhq/coin-multiversx/preload", () => ({
  getCurrentMultiversXPreloadData: () => mockCurrentPreload,
  getMultiversXPreloadDataUpdates: () => mockPreloadUpdates,
}));

const mockGetProviders = jest.fn();
jest.mock("@ledgerhq/coin-multiversx/network/api", () => ({
  createNetworkApi: () => ({ getProviders: mockGetProviders }),
}));

// The legacy currency bridge carries the preload; the generic one does not.
let mockGenericBridge = true;
jest.mock("../../bridge", () => ({
  getCurrencyBridge: async () => (mockGenericBridge ? {} : { preload: jest.fn() }),
}));

const mockLog = jest.fn();
jest.mock("@ledgerhq/logs", () => ({ log: (...args: unknown[]) => mockLog(...args) }));

jest.mock("../../config", () => ({
  getCurrencyConfiguration: () => ({
    apiEndpoint: "https://api",
    delegationApiEndpoint: "https://delegations",
  }),
}));

const provider = (contract: string) => ({ contract }) as unknown as MultiversXProvider;

// Fresh modules per test reset the shared request cache; the testing library is loaded with them so
// it renders with the same React instance as the hook.
async function load() {
  const testingLibrary = await import("@testing-library/react/pure");
  const hook = await import("./react");
  cleanup = testingLibrary.cleanup;
  return { ...testingLibrary, ...hook };
}

let cleanup: (() => void) | undefined;

describe("useMultiversXPreloadData", () => {
  afterEach(() => {
    cleanup?.();
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.resetModules();
    mockGetProviders.mockReset();
    mockLog.mockReset();
    mockCurrentPreload = { validators: [] };
    mockGenericBridge = true;
  });

  it("fetches the providers on the generic bridge, which has no preload", async () => {
    mockGetProviders.mockResolvedValue([provider("erd1a"), provider("erd1b")]);
    const { useMultiversXPreloadData, renderHook, waitFor } = await load();

    const { result } = renderHook(() => useMultiversXPreloadData());

    await waitFor(() =>
      expect(result.current.validators).toEqual([provider("erd1a"), provider("erd1b")]),
    );
  });

  it("keeps the preloaded validators without fetching on the legacy bridge", async () => {
    mockGenericBridge = false;
    mockCurrentPreload = { validators: [provider("erd1preloaded")] };
    const { useMultiversXPreloadData, renderHook, act } = await load();

    const { result } = renderHook(() => useMultiversXPreloadData());
    // Let the bridge lookup settle, so a fetch it would start has started.
    await act(() => new Promise(resolve => setTimeout(resolve, 0)));

    expect(result.current.validators).toEqual([provider("erd1preloaded")]);
    expect(mockGetProviders).not.toHaveBeenCalled();
  });

  it("leaves a pending legacy preload to fill the providers", async () => {
    mockGenericBridge = false;
    const { useMultiversXPreloadData, renderHook, act, waitFor } = await load();

    const { result } = renderHook(() => useMultiversXPreloadData());
    act(() => mockPreloadUpdates.next({ validators: [provider("erd1preloaded")] }));

    await waitFor(() => expect(result.current.validators).toEqual([provider("erd1preloaded")]));
    expect(mockGetProviders).not.toHaveBeenCalled();
  });

  it("starts a screen opened after the fetch from the providers already fetched", async () => {
    mockGetProviders.mockResolvedValue([provider("erd1a")]);
    const { useMultiversXPreloadData, fetchMultiversXProviders, renderHook } = await load();
    await fetchMultiversXProviders();

    const { result } = renderHook(() => useMultiversXPreloadData());

    expect(result.current.validators).toEqual([provider("erd1a")]);
  });

  it("logs a failed request and keeps what the screen shows", async () => {
    mockCurrentPreload = { validators: [provider("erd1stale")] };
    mockGetProviders.mockRejectedValue(new Error("down"));
    const { useMultiversXPreloadData, renderHook, waitFor } = await load();

    const { result } = renderHook(() => useMultiversXPreloadData());

    await waitFor(() => expect(mockLog).toHaveBeenCalledTimes(1));
    expect(mockLog).toHaveBeenCalledWith(
      "multiversx/providers",
      "staking providers request failed",
      { error: "Error: down" },
    );
    expect(result.current.validators).toEqual([provider("erd1stale")]);
  });

  it("asks the network once for every caller", async () => {
    mockGetProviders.mockResolvedValue([provider("erd1a")]);
    const { useMultiversXPreloadData, renderHook, waitFor } = await load();

    const first = renderHook(() => useMultiversXPreloadData());
    const second = renderHook(() => useMultiversXPreloadData());

    await waitFor(() => expect(first.result.current.validators).toEqual([provider("erd1a")]));
    await waitFor(() => expect(second.result.current.validators).toEqual([provider("erd1a")]));
    expect(mockGetProviders).toHaveBeenCalledTimes(1);
  });
});

describe("fetchMultiversXProviders", () => {
  beforeEach(() => {
    jest.resetModules();
    mockGetProviders.mockReset();
  });

  afterEach(() => jest.restoreAllMocks());

  it("retries on the next caller after a failed request", async () => {
    mockGetProviders.mockRejectedValueOnce(new Error("down"));
    mockGetProviders.mockResolvedValueOnce([provider("erd1a")]);
    const { fetchMultiversXProviders } = await load();

    await expect(fetchMultiversXProviders()).rejects.toThrow("down");
    await expect(fetchMultiversXProviders()).resolves.toEqual([provider("erd1a")]);
    expect(mockGetProviders).toHaveBeenCalledTimes(2);
  });

  it("asks again once the providers are as old as the legacy preload may get", async () => {
    mockGetProviders.mockResolvedValueOnce([provider("erd1old")]);
    mockGetProviders.mockResolvedValueOnce([provider("erd1new")]);
    const now = jest.spyOn(Date, "now").mockReturnValue(0);
    const { fetchMultiversXProviders, PROVIDERS_MAX_AGE } = await load();

    await expect(fetchMultiversXProviders()).resolves.toEqual([provider("erd1old")]);
    now.mockReturnValue(PROVIDERS_MAX_AGE - 1);
    await expect(fetchMultiversXProviders()).resolves.toEqual([provider("erd1old")]);
    now.mockReturnValue(PROVIDERS_MAX_AGE);
    await expect(fetchMultiversXProviders()).resolves.toEqual([provider("erd1new")]);
    expect(mockGetProviders).toHaveBeenCalledTimes(2);
  });
});
