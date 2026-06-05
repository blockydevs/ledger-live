import { ChartDataPoint } from "./types";

/** Median of the gaps between consecutive timestamps (0 when not computable). */
function medianSpacing(points: readonly ChartDataPoint[]): number {
  const deltas: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const delta = points[i][0] - points[i - 1][0];
    if (delta > 0) deltas.push(delta);
  }
  if (deltas.length === 0) return 0;
  deltas.sort((a, b) => a - b);
  const mid = deltas.length >> 1;
  return deltas.length % 2 === 0 ? (deltas[mid - 1] + deltas[mid]) / 2 : deltas[mid];
}

/**
 * Resamples a price series (sorted ascending by timestamp) toward roughly one
 * point per `targetIntervalMs`, while always preserving:
 * - the first and last points (range bounds / % change),
 * - the global min and max points (amplitude + high/low markers).
 *
 * Rather than thresholding each gap against the target — which alternates kept
 * spacings (e.g. 5min/10min) when the target sits near the native spacing and
 * timestamps jitter around it — we derive a single integer stride from the
 * median native spacing (`round(target / median)`) and keep every stride-th
 * point. This yields a constant spacing landing exactly on the spec multiples
 * (5min→×1, 10min→×2, 6h→×6, …) and is immune to per-point jitter.
 *
 * The stride is at least 1, so this only ever coarsens: when the target is finer
 * than the data (e.g. a 3h target on a daily series) the series is returned at
 * its native resolution. Assumes roughly uniform native spacing, which the
 * market API guarantees within a given range.
 *
 * Returns a new array; the input is not mutated.
 */
export function resampleChartPointsByInterval(
  points: readonly ChartDataPoint[],
  targetIntervalMs: number,
): ChartDataPoint[] {
  const length = points.length;
  if (length <= 2 || !Number.isFinite(targetIntervalMs) || targetIntervalMs <= 0) {
    return points.slice();
  }

  const median = medianSpacing(points);
  const stride = median > 0 ? Math.max(1, Math.round(targetIntervalMs / median)) : 1;
  if (stride === 1) return points.slice();

  let minIndex = 0;
  let maxIndex = 0;
  for (let i = 1; i < length; i++) {
    if (points[i][1] < points[minIndex][1]) minIndex = i;
    if (points[i][1] > points[maxIndex][1]) maxIndex = i;
  }

  // Endpoints and extrema are always kept; the stride fills in evenly spaced
  // points between them so the rendered line keeps its shape.
  const kept = new Set<number>([0, length - 1, minIndex, maxIndex]);
  for (let i = 0; i < length; i += stride) kept.add(i);

  return Array.from(kept)
    .sort((a, b) => a - b)
    .map(i => points[i]);
}
