import { act, renderHook } from "tests/testSetup";
import {
  LINE_CHART_RANGES,
  DEFAULT_LINE_CHART_HEIGHT,
  LINE_CHART_COLOR_TO_STROKE,
} from "../constants";
import { useLineChartViewModel } from "../useLineChartViewModel";
import type { LineChartProps, LineChartSeries } from "../types";

const MOCK_SERIES: LineChartSeries[] = [
  {
    id: "price",
    data: [1, 2, 3],
    label: "Price",
    stroke: "",
  },
];

const defaultProps: LineChartProps = {
  series: MOCK_SERIES,
  selectedRange: "1D",
  onRangeChange: jest.fn(),
};

describe("useLineChartViewModel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("applies the theme stroke token to each chart series", () => {
    const { result } = renderHook(() => useLineChartViewModel(defaultProps));

    expect(result.current.chartSeries).toEqual([
      {
        ...MOCK_SERIES[0],
        stroke: LINE_CHART_COLOR_TO_STROKE.muted,
      },
    ]);
  });

  it("uses the success stroke token when color is success", () => {
    const { result } = renderHook(() =>
      useLineChartViewModel({
        ...defaultProps,
        color: "success",
      }),
    );

    expect(result.current.chartSeries[0]?.stroke).toBe(LINE_CHART_COLOR_TO_STROKE.success);
  });

  it("forwards loading, error, and layout props", () => {
    const { result } = renderHook(() =>
      useLineChartViewModel({
        ...defaultProps,
        isLoading: true,
        isError: true,
        errorMessage: "Custom error",
        height: 180,
        selectedRange: "1Y",
      }),
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isError).toBe(true);
    expect(result.current.errorMessage).toBe("Custom error");
    expect(result.current.height).toBe(180);
    expect(result.current.selectedRange).toBe("1Y");
  });

  it("calls onRangeChange when handleSelectedChange is invoked", () => {
    const onRangeChange = jest.fn();
    const { result } = renderHook(() =>
      useLineChartViewModel({
        ...defaultProps,
        onRangeChange,
      }),
    );

    act(() => {
      result.current.handleSelectedChange("1Y");
    });

    expect(onRangeChange).toHaveBeenCalledWith("1Y");
  });

  it("builds translated range buttons for every supported range", () => {
    const { result } = renderHook(() => useLineChartViewModel(defaultProps));

    expect(result.current.rangeButtons).toHaveLength(LINE_CHART_RANGES.length);
    expect(result.current.rangeButtons.map(button => button.value)).toEqual([...LINE_CHART_RANGES]);
    expect(result.current.rangeButtons.find(button => button.value === "ALL")?.label).toBe("All");
    expect(result.current.rangeSelectorLabel).toBe("Select time range");
  });

  it("defaults height to DEFAULT_LINE_CHART_HEIGHT", () => {
    const { result } = renderHook(() => useLineChartViewModel(defaultProps));

    expect(result.current.height).toBe(DEFAULT_LINE_CHART_HEIGHT);
  });

  it("keeps chartWidth null until the container is measured", () => {
    const { result } = renderHook(() => useLineChartViewModel(defaultProps));

    expect(result.current.chartWidth).toBeNull();
  });
});
