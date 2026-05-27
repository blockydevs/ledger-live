import React, { createRef } from "react";
import { render, screen } from "tests/testSetup";
import { LineChartPlot } from "../LineChartPlot";
import type { LineChartSeries } from "../types";

const MOCK_SERIES: LineChartSeries[] = [
  {
    id: "price",
    data: [1, 2, 3, 4],
    label: "Price",
    stroke: "#000000",
  },
];

const defaultProps = {
  chartWrapperRef: createRef<HTMLDivElement>(),
  height: 240,
  isLoading: false,
  isError: false,
  chartWidth: null as number | null,
  chartSeries: MOCK_SERIES,
};

describe("LineChartPlot", () => {
  it("shows the loading skeleton when isLoading is true", () => {
    render(<LineChartPlot {...defaultProps} isLoading />);

    expect(screen.getByTestId("line-chart-loading")).toBeVisible();
    expect(screen.queryByTestId("line-chart-error")).not.toBeInTheDocument();
  });

  it("shows the default error message when isError is true", () => {
    render(<LineChartPlot {...defaultProps} isError />);

    expect(screen.getByTestId("line-chart-error")).toBeVisible();
    expect(screen.getByText("Unable to load chart")).toBeVisible();
  });

  it("shows a custom error message when provided", () => {
    render(<LineChartPlot {...defaultProps} isError errorMessage="Network unavailable" />);

    expect(screen.getByText("Network unavailable")).toBeVisible();
  });

  it("renders the chart when chartWidth is available", () => {
    const { container } = render(<LineChartPlot {...defaultProps} chartWidth={400} />);

    expect(screen.queryByTestId("line-chart-loading")).not.toBeInTheDocument();
    expect(screen.queryByTestId("line-chart-error")).not.toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
