/**
 * Keys identify a piece of state: `theme`, `media:42`, `media:*`, or the
 * reserved global key `*`.
 *
 * Grammar: segments separated by `:`. A segment is a non-empty run of
 * characters other than whitespace, `:` and `*`. A wildcard may only appear
 * as the whole final segment (`media:*`), which keeps matching O(segments)
 * and CSS rule count bounded.
 */
export type Key = string;

/** The reserved key meaning "affects everything". */
export const GLOBAL_KEY = "*";

const SEP = ":";
const SEGMENT = /^[^\s:*]+$/;

/** Result of `parseKey`. */
export interface ParsedKey {
  /** The key as given. */
  readonly raw: Key;
  /** Concrete segments. For `media:*` this is `["media"]`; for `*` it is `[]`. */
  readonly segments: readonly string[];
  /** Ends in `*` (true for the global key too). */
  readonly wildcard: boolean;
  /** The key is `*`. */
  readonly global: boolean;
}

/** Thrown by `parseKey` for malformed keys. */
export class InvalidKeyError extends Error {
  constructor(key: string, reason: string) {
    super(`[entangled] Invalid key "${key}": ${reason}`);
    this.name = "InvalidKeyError";
  }
}

const cache = new Map<string, ParsedKey>();
const CACHE_LIMIT = 4096;

/** Parse and validate a key. Throws `InvalidKeyError` on malformed input. */
export function parseKey(key: Key): ParsedKey {
  const hit = cache.get(key);
  if (hit) return hit;
  const parsed = parseUncached(key);
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, parsed);
  return parsed;
}

function parseUncached(key: string): ParsedKey {
  if (key === GLOBAL_KEY) {
    return { raw: key, segments: [], wildcard: true, global: true };
  }
  if (key.length === 0) throw new InvalidKeyError(key, "empty key");
  const parts = key.split(SEP);
  const wildcard = parts[parts.length - 1] === "*";
  const segments = wildcard ? parts.slice(0, -1) : parts;
  for (const seg of segments) {
    if (!SEGMENT.test(seg)) {
      throw new InvalidKeyError(
        key,
        seg.includes("*")
          ? "`*` may only appear as the whole final segment"
          : "segments must be non-empty and contain no whitespace",
      );
    }
  }
  return { raw: key, segments, wildcard, global: false };
}

/** Returns true when `key` is well-formed. */
export function isValidKey(key: string): boolean {
  try {
    parseKey(key);
    return true;
  } catch {
    return false;
  }
}

function startsWith(a: readonly string[], prefix: readonly string[]): boolean {
  if (prefix.length > a.length) return false;
  for (let i = 0; i < prefix.length; i++) if (a[i] !== prefix[i]) return false;
  return true;
}

/**
 * Whether a writer key and a reader key refer to overlapping state.
 * Matching is symmetric:
 * - `*` matches everything.
 * - Concrete keys match only themselves.
 * - `ns:*` matches every key strictly below `ns` (`ns:a`, `ns:a:b`, `ns:a:*`),
 *   but not `ns` itself.
 */
export function keyMatches(a: Key, b: Key): boolean {
  const pa = parseKey(a);
  const pb = parseKey(b);
  if (pa.global || pb.global) return true;
  if (!pa.wildcard && !pb.wildcard) return pa.raw === pb.raw;
  if (pa.wildcard && pb.wildcard) {
    return startsWith(pa.segments, pb.segments) || startsWith(pb.segments, pa.segments);
  }
  const [wild, concrete] = pa.wildcard ? [pa, pb] : [pb, pa];
  return concrete.segments.length > wild.segments.length && startsWith(concrete.segments, wild.segments);
}

/** Join segments into a namespace string (`["media","42"]` -> `"media:42"`). */
export function joinSegments(segments: readonly string[], end = segments.length): string {
  let out = "";
  for (let i = 0; i < end; i++) out += (i === 0 ? "" : SEP) + segments[i];
  return out;
}

/**
 * Split a space-separated attribute value (`data-en-affects="theme media:42"`)
 * into distinct keys. Invalid tokens are dropped and reported through `onInvalid`.
 */
export function splitKeys(value: string | null | undefined, onInvalid?: (token: string) => void): Key[] {
  if (!value) return [];
  const out: Key[] = [];
  for (const token of value.split(/\s+/)) {
    if (!token) continue;
    if (isValidKey(token)) {
      if (!out.includes(token)) out.push(token);
    } else {
      onInvalid?.(token);
    }
  }
  return out;
}
