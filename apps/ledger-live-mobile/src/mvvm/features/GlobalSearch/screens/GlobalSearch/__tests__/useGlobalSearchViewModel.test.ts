import { renderHook, act } from "@tests/test-renderer";
import { track } from "~/analytics";
import { useGlobalSearchViewModel } from "../useGlobalSearchViewModel";

const mockGoBack = jest.fn();

jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => ({ goBack: mockGoBack }),
}));

describe("useGlobalSearchViewModel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("starts inactive with empty default sections and results", () => {
    const { result } = renderHook(() => useGlobalSearchViewModel());

    expect(result.current.isSearchActive).toBe(false);
    expect(result.current.searchResults).toEqual([]);
    expect(result.current.defaultSections).toEqual({
      cryptos: [],
      stablecoins: [],
      stocks: [],
    });
  });

  it("flips isSearchActive when typing and back to false when cleared", () => {
    const { result } = renderHook(() => useGlobalSearchViewModel());

    act(() => result.current.setSearch("btc"));
    expect(result.current.isSearchActive).toBe(true);

    act(() => result.current.clearSearch());
    expect(result.current.search).toBe("");
    expect(result.current.isSearchActive).toBe(false);
  });

  it("tracks search_open on mount", () => {
    renderHook(() => useGlobalSearchViewModel());

    expect(track).toHaveBeenCalledWith("search_open");
  });

  it("navigates back when onBack is invoked", () => {
    const { result } = renderHook(() => useGlobalSearchViewModel());

    act(() => result.current.onBack());

    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });
});
