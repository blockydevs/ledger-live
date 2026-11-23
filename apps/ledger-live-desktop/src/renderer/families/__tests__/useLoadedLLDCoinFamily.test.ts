import { act, renderHook, waitFor } from "tests/testSetup";
import { clearLLDCoinFamilyCache, importLLDCoinFamily } from "../registry";
import { useLoadedLLDCoinFamily } from "../useLoadedLLDCoinFamily";

const mockImportGood = jest.fn();
const mockImportBad = jest.fn();

jest.mock("../loaders", () => ({
  lldFamilyLoaders: [
    { family: "good", importFamily: () => mockImportGood() },
    { family: "bad", importFamily: () => mockImportBad() },
  ],
}));

const goodFamily = { getTokenTypes: () => ["erc20"] };

describe("useLoadedLLDCoinFamily", () => {
  beforeEach(() => {
    ["good", "bad"].forEach(clearLLDCoinFamilyCache);
    mockImportGood.mockResolvedValue({ default: goodFamily });
    mockImportBad.mockRejectedValue(new Error("chunk load failed"));
  });

  it("returns undefined while the family loads, then the family", async () => {
    const { result } = renderHook(() => useLoadedLLDCoinFamily("good"));
    expect(result.current).toBeUndefined();

    await waitFor(() => expect(result.current).toBe(goodFamily));
  });

  it("returns the family on the first render when it is already loaded", async () => {
    await importLLDCoinFamily("good");

    const { result } = renderHook(() => useLoadedLLDCoinFamily("good"));

    expect(result.current).toBe(goodFamily);
  });

  it("returns the family in the same render when the name changes to a loaded family", async () => {
    await importLLDCoinFamily("good");

    const { result, rerender } = renderHook(({ name }) => useLoadedLLDCoinFamily(name), {
      initialProps: { name: "unknown" },
    });
    expect(result.current).toEqual({});

    rerender({ name: "good" });

    expect(result.current).toBe(goodFamily);
  });

  it("returns undefined when the family fails to load", async () => {
    const { result } = renderHook(() => useLoadedLLDCoinFamily("bad"));
    await act(async () => {
      await importLLDCoinFamily("bad").catch(() => {});
    });

    expect(result.current).toBeUndefined();
  });
});
