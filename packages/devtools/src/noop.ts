/**
 * What production builds get from `@entangled-ui/devtools`: the same API,
 * doing nothing, with no dependency on the panel. See index.ts.
 */
import type { DevtoolsOptions } from "./panel.js";
import type { LintInput, LintWarning } from "./lint.js";

export type { DevtoolsOptions } from "./panel.js";
export type { BudgetStat, ForesightStat, LintCode, LintInput, LintWarning } from "./lint.js";

/** No-op; returns a no-op unmount function. */
export function mountDevtools(_runtime: unknown, _options?: DevtoolsOptions): () => void {
  return () => {};
}

/** No-op. */
export function collectBudget(): void {}

/** No-op. */
export function collectForesight(): void {}

/** Always returns no warnings. */
export function lint(_input: LintInput): LintWarning[] {
  return [];
}
