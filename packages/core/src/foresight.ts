import type { Severity } from "./attention.js";
import type { Change, ChangeInput, ChangeKind, ChangeSet } from "./change.js";
import { type Key, keyMatches } from "./key.js";
import type { WriterResolution } from "./runtime.js";

/**
 * Foresight: a control works out what it would change when it's looked at
 * (after the dwell), from the app's own pure functions. Deterministic: a
 * plan is the app's simulate-and-diff, never a guess.
 */

export type { Severity } from "./attention.js";

/** What a foresight plan may return: changes, or keys with a Value Peek (`WriterResolution`). */
export type ForesightResult = ChangeInput | WriterResolution | null | undefined;
/** Works out, when a writer is looked at, what activating it would change. */
export type ForesightPlan = () => ForesightResult;

/** Options for `foresee`. */
export interface ForeseeOptions {
  /** Draw this writer's preview in the caution tone. */
  severity?: Severity;
  /** Reuse the last result while this returns the same value (Object.is). */
  revision?: () => unknown;
  /** Report plans slower than this (ms) as `slow`. Default `foresight.budgetMs` (8). */
  budgetMs?: number;
  /** Compare what was foreseen with what is then confirmed. Default true. */
  deviation?: boolean;
}

/** The three functions a planner needs: the state now, a pure transition, and a diff. */
export interface PlannerSpec<S, A> {
  /** The state now (an immutable snapshot). */
  current(): S;
  /** Apply `action` to `state` without side effects; `undefined` when it can't apply. */
  simulate(state: S, action: A): S | undefined;
  /** What changed between two states. */
  diff(prev: S, next: S): ChangeSet;
}

/**
 * Turn a pure `simulate` and a `diff` into a foresight plan for any action:
 * the changes the action would make now, or `null` when it can't apply,
 * changes nothing, or `simulate` throws.
 */
export function createPlanner<S, A>({ current, simulate, diff }: PlannerSpec<S, A>): (action: A) => ChangeSet | null {
  return (action) => {
    const prev = current();
    let next: S | undefined;
    try {
      next = simulate(prev, action);
    } catch {
      return null;
    }
    if (next === undefined || Object.is(next, prev)) return null;
    const changes = diff(prev, next);
    return changes.length ? changes : null;
  };
}

/** How `diffByKey` identifies, keys and compares list items. */
export interface DiffByKeyOptions<T> {
  /** A stable identity per item. */
  id(item: T): string;
  /** The key an item's readers use. */
  key(id: string): Key;
  /** Default: never "move". */
  moved?(prev: T, next: T, prevIndex: number, nextIndex: number): boolean;
  /** Default: `!Object.is(prev, next)`. */
  modified?(prev: T, next: T): boolean;
  /** Chip text for a change. */
  label?(kind: ChangeKind, prev: T | undefined, next: T | undefined): string | undefined;
}

const notIs = (a: unknown, b: unknown) => !Object.is(a, b);

/**
 * The changes between two lists of items with ids: removals first (in the
 * old order), then additions, moves and modifications in the new order.
 * Duplicate ids: the first occurrence wins.
 */
export function diffByKey<T>(prev: readonly T[], next: readonly T[], o: DiffByKeyOptions<T>): Change[] {
  const index = (list: readonly T[]) => {
    const m = new Map<string, { item: T; i: number }>();
    list.forEach((item, i) => {
      const id = o.id(item);
      if (!m.has(id)) m.set(id, { item, i });
    });
    return m;
  };
  const before = index(prev);
  const after = index(next);
  const modified = o.modified ?? notIs;
  const out: Change[] = [];
  const push = (id: string, kind: ChangeKind, p: T | undefined, n: T | undefined) => {
    const c: { -readonly [K in keyof Change]: Change[K] } = { key: o.key(id), kind };
    if (p !== undefined) c.from = p;
    if (n !== undefined) c.to = n;
    const label = o.label?.(kind, p, n);
    if (label !== undefined) c.label = label;
    out.push(c);
  };
  for (const [id, { item }] of before) if (!after.has(id)) push(id, "remove", item, undefined);
  for (const [id, { item: n, i: ni }] of after) {
    const b = before.get(id);
    if (!b) push(id, "add", undefined, n);
    else if (o.moved?.(b.item, n, b.i, ni)) push(id, "move", b.item, n);
    else if (modified(b.item, n)) push(id, "modify", b.item, n);
  }
  return out;
}

/** What a confirm did differently from what was foreseen. */
export interface ForesightComparison {
  /** Confirmed, but not foreseen. */
  unexpected: Change[];
  /** Foreseen (not as a removal), but not confirmed. */
  missing: Change[];
  /** Foreseen and confirmed, with another kind. */
  mismatched: Array<{ foreseen: Change; actual: Change }>;
}

/**
 * Compare a foreseen change set with what was then confirmed (`remove` is exempt from missing: its
 * readers are gone).
 */
export function compareForesight(foreseen: ChangeSet, actual: ChangeSet): ForesightComparison {
  const kindOf = (c: Change) => c.kind ?? "modify";
  const missing = foreseen.filter((f) => kindOf(f) !== "remove" && !actual.some((a) => keyMatches(a.key, f.key)));
  const unexpected = actual.filter((a) => !foreseen.some((f) => keyMatches(f.key, a.key)));
  const mismatched = foreseen.flatMap((f) => {
    const a = actual.find((x) => keyMatches(x.key, f.key));
    return a && kindOf(a) !== kindOf(f) ? [{ foreseen: f, actual: a }] : [];
  });
  return { unexpected, missing, mismatched };
}
