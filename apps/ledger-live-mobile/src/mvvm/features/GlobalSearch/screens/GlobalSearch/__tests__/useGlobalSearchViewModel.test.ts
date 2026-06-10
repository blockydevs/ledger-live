import { renderHook, act } from "@tests/test-renderer";
import { track } from "~/analytics";
import { useGlobalSearchViewModel } from "../useGlobalSearchViewModel";
import { useGlobalSearchDefaults } from "../useGlobalSearchDefaults";

const mockGoBack = jest.fn();

jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => ({ goBack: mockGoBack }),
}));

jest.mock("../useGlobalSearchDefaults");

const mockedUseGlobalSearchDefaults = jest.mocked(useGlobalSearchDefaults);

const EMPTY_SECTIONS = { cryptos: [], stablecoins: [], stocks: [] };

describe("useGlobalSearchViewModel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseGlobalSearchDefaults.mockReturnValue({
      defaultSections: EMPTY_SECTIONS,
      isLoadingDefaults: false,
    });
  });

  it("starts inactive and exposes the default sections from the data hook", () => {
    const { result } = renderHook(() => useGlobalSearchViewModel());

    expect(result.current.isSearchActive).toBe(false);
    expect(result.current.searchResults).toEqual([]);
    expect(result.current.defaultSections).toEqual(EMPTY_SECTIONS);
  });

  it("flips isSearchActive when typing and back to false when cleared", () => {
    const { result } = renderHook(() => useGlobalSearchViewModel());

    act(() => result.current.setSearch("btc"));
    expect(result.current.isSearchActive).toBe(true);

    act(() => result.current.clearSearch());
    expect(result.current.search).toBe("");
    expect(result.current.isSearchActive).toBe(false);
  });

  it("enables default fetching only while no search is active", () => {
    const { result } = renderHook(() => useGlobalSearchViewModel());

    expect(mockedUseGlobalSearchDefaults).toHaveBeenLastCalledWith(true);

    act(() => result.current.setSearch("btc"));
    expect(mockedUseGlobalSearchDefaults).toHaveBeenLastCalledWith(false);
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
