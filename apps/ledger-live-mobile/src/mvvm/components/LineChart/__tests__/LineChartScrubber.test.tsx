import React from "react";
import { render } from "@tests/test-renderer";
import { LineChartScrubber } from "../LineChartScrubber";
import type { LineChartSeries } from "../types";
import type { ScrubberTooltipContent } from "@ledgerhq/lumen-ui-rnative-visualization";

let buildTooltip: ((dataIndex: number) => ScrubberTooltipContent) | undefined;
let showBeacons: boolean | undefined;

jest.mock("@ledgerhq/lumen-ui-rnative-visualization", () => ({
  Scrubber: (props: { tooltip?: typeof buildTooltip; showBeacons?: boolean }) => {
    buildTooltip = props.tooltip;
    showBeacons = props.showBeacons;
    return null;
  },
}));

const series: LineChartSeries[] = [
  { id: "price", data: [10, null, 30], label: "Price", stroke: "" },
  { id: "volume", data: [1, 2, 3], label: "Volume", stroke: "" },
];

const renderScrubber = (tooltipTitle?: (i: number) => string | undefined, showTooltip?: boolean) =>
  render(
    <LineChartScrubber
      series={series}
      formatValue={v => `$${v}`}
      tooltipTitle={tooltipTitle}
      showTooltip={showTooltip}
    />,
  );

describe("LineChartScrubber", () => {
  it("builds a row per series with a valid value at the index", () => {
    renderScrubber();
    expect(buildTooltip?.(0)).toEqual({
      items: [
        { label: "Price", value: "$10" },
        { label: "Volume", value: "$1" },
      ],
    });
  });

  it("skips series whose value is null or missing", () => {
    renderScrubber();
    expect(buildTooltip?.(1)).toEqual({ items: [{ label: "Volume", value: "$2" }] });
  });

  it("adds the title when tooltipTitle returns a non-empty string", () => {
    renderScrubber(i => `Point ${i}`);
    expect(buildTooltip?.(2)).toMatchObject({ title: "Point 2" });
  });

  it("omits the title when tooltipTitle is empty or undefined", () => {
    renderScrubber(() => "");
    expect("title" in (buildTooltip?.(2) ?? {})).toBe(false);
  });

  it("renders the tooltip by default", () => {
    renderScrubber();
    expect(buildTooltip).toBeDefined();
    expect(showBeacons).toBe(true);
  });

  it("omits the tooltip but keeps beacons when showTooltip is false", () => {
    renderScrubber(undefined, false);
    expect(buildTooltip).toBeUndefined();
    expect(showBeacons).toBe(true);
  });
});
