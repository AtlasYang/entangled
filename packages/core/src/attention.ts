import { type Key, keyMatches, parseKey } from "./key.js";
import type { Origin } from "./origin.js";
import type { ReverseQueryOptions } from "./reverse.js";

/**
 * Attention: how much a page cues, and how loudly each confirm is told.
 * A profile picks sensible defaults for a kind of product; an attention level
 * is the user's (or the app's) dial, switchable at runtime; notify levels say,
 * per key and origin, how a confirm is announced.
 */

/**
 * `"site"`: content pages and marketing sites. `"app"`: dense tools, where controls confirm
 * manually.
 */
export type Profile = "site" | "app";
/** How much the page cues: `off` suspends everything, `guided` is for learning a new screen. */
export type AttentionLevel = "off" | "minimal" | "standard" | "guided";
/** How a confirm is told: not at all, softly, as usual, or so it can't be missed. */
export type NotifyLevel = "ignore" | "quiet" | "aware" | "interrupt";

/**
 * A change that can't be taken back easily: drawn in the caution tone, never habituates, and passes
 * `minimal`.
 */
export type Severity = "destructive";

/** Every attention level, from least to most cueing. */
export const ATTENTION_LEVELS: readonly AttentionLevel[] = ["off", "minimal", "standard", "guided"];

/** What a profile sets when the matching option is omitted. */
export interface ProfileDefaults {
  /** Runtime mode. */
  mode: "css" | "js" | "auto";
  /** Default for `ConfirmOptions.includeWriters`. */
  includeWriters: boolean;
  /** Writers without `data-en-confirm` confirm on activation. */
  autoConfirm: boolean;
  /** Reverse query on a held modifier, or `false`. */
  reverseQuery: false | ReverseQueryOptions;
  /** Habituation on or off. */
  habituation: boolean;
}

/** Defaults per profile. Explicit options always win. */
export const PROFILE_DEFAULTS: Readonly<Record<Profile, ProfileDefaults>> = Object.freeze({
  site: Object.freeze({
    mode: "auto",
    includeWriters: true,
    autoConfirm: true,
    reverseQuery: Object.freeze({ modifier: "Alt", depth: 1 }),
    habituation: true,
  }),
  app: Object.freeze({ mode: "js", includeWriters: false, autoConfirm: false, reverseQuery: false, habituation: false }),
}) as Readonly<Record<Profile, ProfileDefaults>>;

/** Options for `EntangledOptions.attention`. */
export interface AttentionOptions {
  /** Level when nothing is stored (or `persist: false`). Default "standard". */
  level?: AttentionLevel;
  /** Remember `setLevel()` in localStorage. Default true, key "entangled:attention". */
  persist?: boolean | { storageKey?: string };
  /** Notify levels for confirms. */
  notify?: NotifyOptions;
}

/** Notify levels per origin and per key pattern. */
export interface NotifyOptions {
  /** Per origin. Default: every origin "aware". */
  origins?: Partial<Record<Origin, NotifyLevel>>;
  /** Per key pattern (wildcards allowed); the most specific matching pattern wins. */
  keys?: Readonly<Record<Key, NotifyLevel | Partial<Record<Origin, NotifyLevel>>>>;
}

/** How specific a notify pattern is for `key`: exact beats longer wildcards beats `*`. */
function specificity(pattern: Key, key: Key): number {
  if (pattern === key) return Infinity;
  const p = parseKey(pattern);
  return p.global ? -1 : p.segments.length;
}

/**
 * The notify level for a confirm of `key` from `origin`: the most specific
 * matching key pattern, then the origin's level, then `"aware"`. Memoized
 * (the options are static).
 */
export function createNotifyResolver(notify: NotifyOptions = {}): (key: Key, origin: Origin) => NotifyLevel {
  const memo = new Map<string, NotifyLevel>();
  const patterns = Object.keys(notify.keys ?? {});
  return (key, origin) => {
    const slot = `${origin} ${key}`;
    let level = memo.get(slot);
    if (level !== undefined) return level;
    let best: Key | null = null;
    let score = -Infinity;
    for (const p of patterns) {
      if (!keyMatches(p, key)) continue;
      const s = specificity(p, key);
      if (s > score) {
        best = p;
        score = s;
      }
    }
    const value = best === null ? undefined : notify.keys![best];
    level = (typeof value === "string" ? value : value?.[origin]) ?? notify.origins?.[origin] ?? "aware";
    memo.set(slot, level);
    return level;
  };
}

/** The stored level, if storage is readable and holds a valid one. */
export function readStoredLevel(storageKey: string): AttentionLevel | null {
  try {
    const v = typeof localStorage === "undefined" ? null : localStorage.getItem(storageKey);
    return v !== null && (ATTENTION_LEVELS as readonly string[]).includes(v) ? (v as AttentionLevel) : null;
  } catch {
    return null;
  }
}

/** Remember `level`; storage errors are ignored. */
export function storeLevel(storageKey: string, level: AttentionLevel): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(storageKey, level);
  } catch {
    // Private mode, quota, disabled storage: the level still applies for this page.
  }
}
