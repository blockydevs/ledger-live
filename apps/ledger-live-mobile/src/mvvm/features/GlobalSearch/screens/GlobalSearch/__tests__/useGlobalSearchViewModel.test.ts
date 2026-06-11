import { renderHook, act } from "@tests/test-renderer";
import { track } from "~/analytics";
import { useGlobalSearchViewModel } from "../useGlobalSearchViewModel";
import { useGlobalSearchDefaults } from "../useGlobalSearchDefaults";
import { useGlobalSearchResults, type GlobalSearchResults } from "../useGlobalSearchResults";

const mockGoBack = jest.fn();

jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => ({ goBack: mockGoBack }),
}));

jest.mock("../useGlobalSearchDefaults");
jest.mock("../useGlobalSearchResults");

const mockedDefaults = jest.mocked(useGlobalSearchDefaults);
const mockedResults = jest.mocked(useGlobalSearchResults);

const EMPTY_SECTIONS = { cryptos: [], stablecoins: [], stocks: [] };

const resultsState = (overrides: Partial<GlobalSearchResults> = {}): GlobalSearchResults => ({
  search: "",
  setSearch: jest.fn(),
  clearSearch: jest.fn(),
  isSearchActive: false,
  searchResults: [],
  isLoadingSearch: false,
  hasNoResults: false,
  ...overrides,
});

describe("useGlobalSearchViewModel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedDefaults.mockReturnValue({ defaultSections: EMPTY_SECTIONS, isLoadingDefaults: false });
    mockedResults.mockReturnValue(resultsState());
  });

  it("composes default sections and search results from the data hooks", () => {
    const cryptos = [{ id: "btc" }] as never;
    const searchResults = [{ id: "eth" }] as never;
    mockedDefaults.mockReturnValue({
      defaultSections: { ...EMPTY_SECTIONS, cryptos },
      isLoadingDefaults: true,
    });
    mockedResults.mockReturnValue(resultsState({ searchResults, isLoadingSearch: true }));

    const { result } = renderHook(() => useGlobalSearchViewModel());

    expect(result.current.defaultSections.cryptos).toBe(cryptos);
    expect(result.current.isLoadingDefaults).toBe(true);
    expect(result.current.searchResults).toBe(searchResults);
    expect(result.current.isLoadingSearch).toBe(true);
  });

  it("enables default fetching while no search is active", () => {
    mockedResults.mockReturnValue(resultsState({ isSearchActive: false }));

    renderHook(() => useGlobalSearchViewModel());

    expect(mockedDefaults).toHaveBeenLastCalledWith(true);
  });

  it("disables default fetching while a search is active", () => {
    mockedResults.mockReturnValue(resultsState({ isSearchActive: true }));

    renderHook(() => useGlobalSearchViewModel());

    expect(mockedDefaults).toHaveBeenLastCalledWith(false);
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
