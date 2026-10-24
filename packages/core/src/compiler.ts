import { habituationVar } from "./habituation.js";
import { type Key, joinSegments, keyMatches, parseKey } from "./key.js";

/**
 * Input to the CSS compiler. Plain data, so it can come from a live graph
 * (`graph.snapshot()` satisfies the required part) or from build-time static
 * analysis of source code.
 */
export interface CompileInput {
  /** Distinct writer keys. */
  writerKeys: readonly Key[];
  /** Reader keys whose readers are drawn by the global overlay (`<html>`, `<body>`, `veil`). */
  overlayKeys?: readonly Key[];
  /** Per-writer-key intensity after the attention budget (default 1). */
  intensities?: Readonly<Record<Key, number>>;
  /**
   * Distinct reader keys. When given, selectors for reader tokens that no
   * reader uses are omitted (smaller, cheaper rules; benchmarks show selector
   * complexity matters on every hover).
   */
  readerKeys?: readonly Key[];
  /** Writer keys with readers over the attention budget (`data-en-over`). Default: assume any. */
  overflowKeys?: readonly Key[];
  /** Writer keys where a writer is also one of its own readers. Default: assume any. */
  selfKeys?: readonly Key[];
}

/** Output options for `compileGraphCss`. */
export interface CompileOptions {
  /**
   * Gate pointer-hover rules behind `@media (hover: hover)` so touch devices
   * (sticky `:hover` after a tap) don't preview. Default true.
   */
  gateHover?: boolean;
  /** Cascade layer for the generated rules. Default `"entangled.state"`. */
  layer?: string;
  /**
   * Scale each key's intensity by its habituation multiplier, read from
   * `--en-int-<key>` on the root (absent means 1). Default false.
   */
  habituation?: boolean;
}

/** Escape a value for use inside a double-quoted CSS attribute selector. */
export function cssString(value: string): string {
  return `"${value.replace(/["\\]/g, "\\$&").replace(/[\n\r\f]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `)}"`;
}

const attr = (name: string, token: string) => `[${name}~=${cssString(token)}]`;

/**
 * Selectors (without the `[data-en-fx]` guard) for readers that a writer of
 * `key` affects. Mirrors `keyMatches` exactly, in O(segments) selectors:
 *
 * - concrete `a:b`   -> `by~="a:b"`, plus wildcard readers above it: `by~="a:*"`, `by~="*"`
 * - wildcard `a:*`   -> anything inside namespace `a` via `ns~="a"`, plus
 *                      wildcard readers strictly above it, plus `by~="*"`
 *
 * With `present`, selectors for tokens no reader uses are omitted.
 */
export function readerSelectors(key: Key, present?: ReaderPresence): string[] {
  const p = parseKey(key);
  if (p.global) return [];
  const out: string[] = [];
  const by = (token: string) => {
    if (!present || present.tokens.has(token)) out.push(attr("data-en-by", token));
  };
  if (p.wildcard) {
    const ns = joinSegments(p.segments);
    if (!present || present.namespaces.has(ns)) out.push(attr("data-en-ns", ns));
  } else {
    by(key);
  }
  for (let i = 1; i < p.segments.length; i++) by(`${joinSegments(p.segments, i)}:*`);
  by("*");
  return out;
}

/** Which reader tokens and namespaces exist, for pruning selectors. */
export interface ReaderPresence {
  /** Reader keys as written in `data-en-by`. */
  tokens: ReadonlySet<string>;
  /** Namespace tokens as written in `data-en-ns`. */
  namespaces: ReadonlySet<string>;
}

/** Build a `ReaderPresence` from the distinct reader keys. */
export function readerPresence(readerKeys: readonly Key[]): ReaderPresence {
  return { tokens: new Set(readerKeys), namespaces: new Set(readerKeys.flatMap(namespaceTokens)) };
}

/** Namespace tokens a reader key contributes to `data-en-ns`. */
export function namespaceTokens(key: Key): string[] {
  const p = parseKey(key);
  if (p.global) return [];
  const end = p.wildcard ? p.segments.length : p.segments.length - 1;
  const out: string[] = [];
  for (let i = 1; i <= end; i++) out.push(joinSegments(p.segments, i));
  return out;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Compile writer keys into CSS so hover/focus preview needs no JavaScript.
 * Pure and deterministic: same input, same string.
 *
 * Per writer key `K` it emits one hover rule and one focus-visible rule:
 *
 *   :root:has([data-en-affects~="K"]:hover)
 *     :is(<reader selectors>):where([data-en-fx]):not([data-en-over~="K"], <the hovered writer>) {
 *     --en-preview: 1; --en-intensity: ...; transition-delay: var(--en-dwell);
 *     (and the enter timing: `--_en-preview-duration`, `--_en-preview-ease`,
 *     `--_en-intensity-timing`)
 *   }
 *
 * Rule count is 2 x distinct writer keys (+ overlay rules), independent of
 * how many readers exist. Dynamic per-item writer keys (`media:1...N`) still
 * cost 2N rules; `mode: "auto"` accounts for that.
 *
 * Known differences from JS mode, inherent to CSS:
 * - Nested writers: `:hover` also matches ancestors, so hovering an inner
 *   writer previews the outer writer's keys too (JS uses the innermost).
 *   `:has()` cannot nest, so this can't be filtered out here.
 * - No pointer-velocity filter; pass-through hovers are filtered by the
 *   dwell (`transition-delay`) alone, which also applies to focus.
 */
export function compileGraphCss(input: CompileInput, options: CompileOptions = {}): string {
  const gateHover = options.gateHover ?? true;
  const layer = options.layer ?? "entangled.state";
  const keys = [...new Set(input.writerKeys)].sort();
  const overlayKeys = [...new Set(input.overlayKeys ?? [])];
  const present = input.readerKeys ? readerPresence(input.readerKeys) : undefined;
  const overflow = input.overflowKeys ? new Set(input.overflowKeys) : null;
  const self = input.selfKeys ? new Set(input.selfKeys) : null;
  const habituated = (value: string, key: Key) =>
    options.habituation ? `calc(${value} * var(${habituationVar(key, "preview")}, 1))` : value;

  // A preview fades in with the enter timing; leaving the rule falls back to the exit timing.
  const enter =
    "\n  --_en-preview-duration: var(--en-duration-preview);\n  --_en-preview-ease: var(--en-ease-preview);\n  --_en-intensity-timing: 0s;";
  const hover: string[] = [];
  const focus: string[] = [];
  for (const key of keys) {
    const writer = attr("data-en-affects", key);
    const intensity = round(input.intensities?.[key] ?? 1);
    const readers = readerSelectors(key, present);
    const touchesOverlay = parseKey(key).global || overlayKeys.some((o) => keyMatches(key, o));
    for (const [pseudo, out] of [
      [":hover", hover],
      [":focus-visible", focus],
    ] as const) {
      const scope = `:root:has(${writer}${pseudo})`;
      if (readers.length) {
        const target = readers.length === 1 ? readers[0]! : `:is(${readers.join(", ")})`;
        const exclude: string[] = [];
        if (!overflow || overflow.has(key)) exclude.push(attr("data-en-over", key));
        if (!self || self.has(key)) exclude.push(`${writer}${pseudo}`);
        const not = exclude.length ? `:not(${exclude.join(", ")})` : "";
        out.push(
          `${scope} ${target}:where([data-en-fx])${not} {\n` +
            `  --en-preview: 1;\n  --en-intensity: ${habituated(String(intensity), key)};${enter}\n  transition-delay: var(--en-dwell);\n}`,
        );
      }
      if (touchesOverlay) {
        const overlayIntensity = options.habituation ? `\n  --en-intensity: ${habituated("1", key)};` : "";
        out.push(`${scope} [data-en-overlay] {\n  --en-preview: 1;${overlayIntensity}${enter}\n  transition-delay: var(--en-dwell);\n}`);
      }
    }
  }

  const indent = (rules: string[], by: string) => rules.map((r) => r.replace(/^/gm, by)).join("\n");
  const parts = [`/* @entangled-ui/core compiled: ${keys.length} writer keys */`, `@layer ${layer} {`];
  if (hover.length) {
    parts.push(gateHover ? `  @media (hover: hover) {\n${indent(hover, "    ")}\n  }` : indent(hover, "  "));
  }
  if (focus.length) parts.push(indent(focus, "  "));
  parts.push("}");
  return `${parts.join("\n")}\n`;
}
