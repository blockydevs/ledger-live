export type DiffState = "none" | "added" | "removed";

export interface DiffLine {
  state: DiffState;
  text: string;
}

/**
 * Stringifies a value with a fixed indentation. Both diff sides must go through
 * this so the only differences that surface are real value changes, not
 * mismatched formatting. Key order is left as-is: both sides originate from the
 * same serialization, so it never drifts.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/**
 * Line-level diff of two JSON strings using the longest common subsequence.
 * Unlike a greedy forward-search, LCS resyncs correctly across the many
 * identical lines JSON produces (`{`, `},`, closing brackets, repeated values)
 * and yields a minimal edit script.
 *
 * @param base
 * The "from" side — the value without the local override.
 *
 * @param current
 * The "to" side — the in-memory / edited value.
 *
 * @return
 * The flattened diff: unchanged lines (`none`), lines only in `base`
 * (`removed`), and lines only in `current` (`added`), in display order.
 */
export function diffJsonLines(base: string, current: string): DiffLine[] {
  const a = base.split("\n");
  const b = current.split("\n");
  const m = a.length;
  const n = b.length;

  // Trailing whitespace is meaningless in JSON, so two lines that differ only
  // by it count as equal. Comparison uses the trimmed form; the original text
  // is still what gets displayed.
  const eq = (x: string, y: string) => x.trimEnd() === y.trimEnd();

  // lcs[i][j] = length of the longest common subsequence of a[i:] and b[j:].
  const lcs = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      lcs[i][j] = eq(a[i], b[j]) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  // Backtrack into a flat, in-order list of tagged lines.
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (eq(a[i], b[j])) {
      out.push({ state: "none", text: a[i++] });
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ state: "removed", text: a[i++] });
    } else {
      out.push({ state: "added", text: b[j++] });
    }
  }
  while (i < m) out.push({ state: "removed", text: a[i++] });
  while (j < n) out.push({ state: "added", text: b[j++] });
  return out;
}
