import type { Mode } from "./runtime.js";

/**
 * Selection criteria for `mode: "auto"`, derived from benchmarks.
 *
 * In CSS mode every writer hover invalidates `:root:has()` rules, and the
 * resulting style recalc scales with document size and, multiplicatively,
 * with the number of compiled writer keys. Measured on Chromium:
 *
 *   cssStyleMsPerHover ~ 1.3 + 0.0025 * domNodes * (1 + writerKeys / 20)   (conservative fit)
 *
 * JS mode costs ~1-3 ms per hover regardless of size but paints about one
 * frame later. CSS mode is chosen while its predicted cost stays within a
 * quarter frame (~4 ms), i.e. while the "weighted DOM size" below stays
 * under `maxWeightedDomNodes`.
 */

/** Input to `chooseMode`. */
export interface AutoModeInput {
  /** `:has()` supported and the root is a Document. */
  cssCapable: boolean;
  /** Distinct writer keys in the graph. */
  writerKeys: number;
  /** Elements in the document. */
  domNodes: number;
}

/** Thresholds for `chooseMode`. */
export interface AutoModeLimits {
  /** Hard cap on writer keys for CSS mode (each costs two `:root:has()` rules). */
  maxWriterKeys: number;
  /** Cap on `domNodes * (1 + writerKeys / keyWeight)`. */
  maxWeightedDomNodes: number;
  /** Writer keys that double the per-node cost. */
  keyWeight: number;
}

/** Default limits, fitted for a ~4 ms CSS-mode budget per hover. */
export const AUTO_MODE_LIMITS: Readonly<AutoModeLimits> = Object.freeze({
  maxWriterKeys: 64,
  maxWeightedDomNodes: 1100,
  keyWeight: 20,
});

/** `domNodes * (1 + writerKeys / keyWeight)`: the predicted CSS-mode hover cost in node units. */
export function weightedDomNodes(input: AutoModeInput, limits: AutoModeLimits = AUTO_MODE_LIMITS): number {
  return input.domNodes * (1 + input.writerKeys / limits.keyWeight);
}

/** `"css"` when `:has()` works and both writer-key and weighted-DOM limits hold, else `"js"`. */
export function chooseMode(input: AutoModeInput, limits: AutoModeLimits = AUTO_MODE_LIMITS): Mode {
  if (!input.cssCapable) return "js";
  if (input.writerKeys > limits.maxWriterKeys) return "js";
  return weightedDomNodes(input, limits) <= limits.maxWeightedDomNodes ? "css" : "js";
}
