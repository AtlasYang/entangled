import { type GraphSnapshot, type Key, type PeekRejection, type RuntimeEvent, ATTR, GLOBAL_KEY, keyMatches } from "@entangled-ui/core";

/** Kind of lint warning; see `lint`. */
export type LintCode = "writer-without-readers" | "reader-without-writers" | "over-budget" | "peek-rejected" | "foresight-slow";

/** One finding from `lint`. */
export interface LintWarning {
  /** Kind of warning. */
  code: LintCode;
  /** The key it concerns. */
  key: Key;
  /** Human-readable explanation. */
  message: string;
}

/** Over-budget statistics for one key and kind. */
export interface BudgetStat {
  /** Which effect went over budget. */
  kind: "preview" | "confirm";
  /** How many times this key went over the attention budget. */
  count: number;
  /** The most candidates seen at once. */
  candidates: number;
  /** How many of those `candidates` could be shown. */
  shown: number;
}

/** Slow foresight plans for one writer key. */
export interface ForesightStat {
  /** The writer's `data-en-affects`. */
  key: Key;
  /** How many of its plans ran over the foresight budget. */
  slow: number;
  /** The slowest plan seen, in ms. */
  maxMs: number;
}

/** Input to `lint`. */
export interface LintInput {
  /** `runtime.graph.snapshot()`. */
  snapshot: GraphSnapshot;
  /** Per `kind key`, from `budget` runtime events (see `collectBudget`). */
  budget?: ReadonlyMap<string, BudgetStat & { key: Key }>;
  /** `runtime.peekRejections`. */
  rejections?: readonly PeekRejection[];
  /** Per writer key, from `foresight` runtime events (see `collectForesight`). */
  foresight?: ReadonlyMap<Key, ForesightStat>;
  /** Over-budget warnings start at this many occurrences. Default 3. */
  routinely?: number;
}

/** Fold a `budget` event into per-key statistics. */
export function collectBudget(stats: Map<string, BudgetStat & { key: Key }>, event: RuntimeEvent): void {
  if (event.type !== "budget") return;
  const id = `${event.kind} ${event.key}`;
  const s = stats.get(id) ?? { key: event.key, kind: event.kind, count: 0, candidates: 0, shown: event.shown };
  s.count++;
  if (event.candidates >= s.candidates) {
    s.candidates = event.candidates;
    s.shown = event.shown;
  }
  stats.set(id, s);
}

/** Fold a slow `foresight` event into per-writer-key statistics. */
export function collectForesight(stats: Map<Key, ForesightStat>, event: RuntimeEvent): void {
  if (event.type !== "foresight" || !event.slow) return;
  const key = event.writer.getAttribute(ATTR.affects) ?? event.writer.tagName.toLowerCase();
  const s = stats.get(key) ?? { key, slow: 0, maxMs: 0 };
  s.slow++;
  s.maxMs = Math.max(s.maxMs, event.durationMs);
  stats.set(key, s);
}

/**
 * Graph and runtime hygiene, deterministic and pure:
 * - a writer key no reader depends on (hovering it shows nothing);
 * - a reader key no writer affects (it can never light up);
 * - a key that routinely exceeds the attention budget (what it affects can't all be shown);
 * - peek tokens rejected at registration;
 * - a foresight plan that is routinely slower than its budget.
 */
export function lint({ snapshot, budget, rejections = [], foresight, routinely = 3 }: LintInput): LintWarning[] {
  const out: LintWarning[] = [];
  const { writerKeys, readerKeys, writerCounts, readerCounts } = snapshot;
  for (const key of writerKeys) {
    if (key === GLOBAL_KEY) continue; // affects everything by definition
    if (!readerKeys.some((r) => keyMatches(key, r))) {
      const n = writerCounts[key] ?? 0;
      out.push({
        code: "writer-without-readers",
        key,
        message: `${n} ${n === 1 ? "writer affects" : "writers affect"} "${key}", but nothing reads it: previews show nothing.`,
      });
    }
  }
  for (const key of readerKeys) {
    if (!writerKeys.some((w) => w !== GLOBAL_KEY && keyMatches(w, key))) {
      const n = readerCounts[key] ?? 0;
      out.push({
        code: "reader-without-writers",
        key,
        message: `${n} ${n === 1 ? "element reads" : "elements read"} "${key}", but no control writes it: it can never light up.`,
      });
    }
  }
  for (const s of budget?.values() ?? []) {
    if (s.count < routinely) continue;
    out.push({
      code: "over-budget",
      key: s.key,
      message: `"${s.key}" went over the attention budget ${s.count} times on ${s.kind} (up to ${s.candidates} candidates for ${s.shown} slots). Narrow the key or set data-en-priority.`,
    });
  }
  for (const r of rejections) {
    out.push({ code: "peek-rejected", key: r.key, message: `Peek token ${r.token} for "${r.key}" was rejected: ${r.reason}.` });
  }
  for (const f of foresight?.values() ?? []) {
    if (f.slow < routinely) continue;
    out.push({
      code: "foresight-slow",
      key: f.key,
      message: `The foresight plan of "${f.key}" ran over its budget ${f.slow} times (up to ${Math.round(f.maxMs * 10) / 10} ms). Memoize it with a revision, or simplify the plan.`,
    });
  }
  return out;
}
