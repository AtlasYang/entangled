/**
 * Attention budget: if everything glows, nothing is emphasized.
 *
 * Given candidate targets (already in document order), pick at most
 * `maxTargets` by priority and scale their intensity down as the selection
 * grows, so the total visual weight on screen stays roughly constant.
 */

/** Options for `allocateBudget` and `budgetIntensity`. */
export interface BudgetOptions {
  /** Hard cap on simultaneously highlighted targets. */
  maxTargets: number;
  /** Up to this many targets render at full intensity. Default 3. */
  fullIntensityCount?: number;
  /** Intensity never drops below this (as a fraction of requested). Default 0.35. */
  minIntensity?: number;
  /** Requested intensity before scaling (0-1). Default 1. */
  intensity?: number;
}

/** A target competing for the budget. */
export interface BudgetCandidate<T> {
  /** The element (or any value) to highlight. */
  target: T;
  /** Higher wins. Default 0. */
  priority?: number;
}

/** Output of `allocateBudget`. */
export interface BudgetResult<T> {
  /** Selected targets in input order, all at the same scaled intensity. */
  active: Array<{ target: T; intensity: number }>;
  /** Candidates dropped by the cap, in input order. */
  overflow: T[];
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Per-target intensity for a selection of `count` targets: full up to
 * `fullIntensityCount`, then scaled by `sqrt(full / count)` down to `minIntensity`.
 */
export function budgetIntensity(count: number, options: Omit<BudgetOptions, "maxTargets"> = {}): number {
  const full = Math.max(1, options.fullIntensityCount ?? 3);
  const min = clamp01(options.minIntensity ?? 0.35);
  const requested = clamp01(options.intensity ?? 1);
  if (count <= 0) return 0;
  const scale = count <= full ? 1 : Math.max(min, Math.sqrt(full / count));
  return Math.round(requested * scale * 1000) / 1000;
}

/**
 * Select and weight targets. Stable: equal priorities keep input order, so
 * passing candidates in document order yields "first N on the page".
 */
export function allocateBudget<T>(candidates: readonly BudgetCandidate<T>[], options: BudgetOptions): BudgetResult<T> {
  const max = Math.max(0, Math.floor(options.maxTargets));
  const ranked = candidates
    .map((c, i) => ({ c, i, p: c.priority ?? 0 }))
    .sort((a, b) => b.p - a.p || a.i - b.i);
  const chosen = ranked.slice(0, max);
  const chosenIdx = new Set(chosen.map((r) => r.i));
  const intensity = budgetIntensity(chosen.length, options);
  return {
    active: chosen.sort((a, b) => a.i - b.i).map((r) => ({ target: r.c.target, intensity })),
    overflow: candidates.filter((_, i) => !chosenIdx.has(i)).map((c) => c.target),
  };
}

/**
 * The `k` smallest items under `compare`, in order, in O(n log k)
 * comparisons; cheaper than sorting everything when only the head is kept
 * (e.g. top-8 of thousands by document order, where each comparison is a
 * `compareDocumentPosition` call). Stable for equal items.
 */
export function selectTop<T>(items: Iterable<T>, k: number, compare: (a: T, b: T) => number): T[] {
  const out: T[] = [];
  if (k <= 0) return out;
  for (const item of items) {
    if (out.length === k && compare(item, out[k - 1]!) >= 0) continue;
    // Insert after equal items, keeping the selection stable.
    let lo = 0;
    let hi = out.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (compare(item, out[mid]!) < 0) hi = mid;
      else lo = mid + 1;
    }
    out.splice(lo, 0, item);
    if (out.length > k) out.pop();
  }
  return out;
}
