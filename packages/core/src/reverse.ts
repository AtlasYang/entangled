import { cssString } from "./compiler.js";
import type { Graph } from "./graph.js";
import { GLOBAL_KEY, type Key, keyMatches } from "./key.js";

/**
 * Reverse query: invert the graph. Hold a modifier and point at (or focus)
 * any element, and the controls that affect it light up, answering "why
 * does this look like this?" (the spreadsheet "trace precedents" idea).
 */

/** Key that activates a reverse query while held. */
export type QueryModifier = "Alt" | "Shift" | "Control" | "Meta";

/** Reverse query settings. */
export interface ReverseQueryOptions {
  /** Default `"Alt"` (Option on macOS). */
  modifier?: QueryModifier;
  /** 1: direct writers. 2: also writers of those writers (when they read keys too). Default 1. */
  depth?: number;
}

/** `*` writers affect everything, but they aren't what controls one particular element. */
function writesThrough(graph: Graph<Element>, writer: Element, key: Key): boolean {
  return graph.keysOf(writer, "writer").some((k) => k !== GLOBAL_KEY && keyMatches(k, key));
}

/**
 * The writers that affect `reader`, up to `depth` hops: depth 2 adds the
 * writers of keys that those writers themselves read. Never includes
 * `reader` itself. O(keys x matching writers); no DOM access.
 */
export function sourcesOf(graph: Graph<Element>, reader: Element, depth = 1): Set<Element> {
  const out = new Set<Element>();
  const seenKeys = new Set<Key>();
  let frontier: Element[] = [reader];
  for (let d = 0; d < depth && frontier.length > 0; d++) {
    const next: Element[] = [];
    for (const el of frontier) {
      for (const key of graph.keysOf(el, "reader")) {
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        for (const w of graph.writersOf(key)) {
          if (w === reader || out.has(w) || !writesThrough(graph, w, key)) continue;
          out.add(w);
          next.push(w);
        }
      }
    }
    frontier = next;
  }
  return out;
}

/**
 * For the CSS compiler: reader key -> the writer keys whose writers should
 * show as sources when a reader of that key is hovered, up to `depth`.
 */
export function reverseReach(graph: Graph<Element>, depth = 1): Record<Key, Key[]> {
  const { readerKeys } = graph.snapshot();
  const out: Record<Key, Key[]> = {};
  for (const key of readerKeys) {
    const keys = new Set<Key>();
    const seen = new Set<Key>([key]);
    let frontier: Key[] = [key];
    for (let d = 0; d < depth && frontier.length > 0; d++) {
      const next: Key[] = [];
      for (const k of frontier) {
        for (const w of graph.writersOf(k)) {
          for (const wk of graph.keysOf(w, "writer")) if (wk !== GLOBAL_KEY && keyMatches(wk, k)) keys.add(wk);
          if (d + 1 < depth) {
            for (const rk of graph.keysOf(w, "reader")) {
              if (!seen.has(rk)) {
                seen.add(rk);
                next.push(rk);
              }
            }
          }
        }
      }
      frontier = next;
    }
    if (keys.size > 0) out[key] = [...keys].sort();
  }
  return out;
}

/**
 * Compile reverse-query rules from `reverseReach` output. Pure. Per reader
 * key, one hover and one focus-visible rule, gated on `:root[data-en-query]`:
 *
 *   :root[data-en-query]:has([data-en-by~="theme"]:hover)
 *     [data-en-affects~="theme"] { --en-source: 1; }
 *
 * The runtime sets that attribute and injects the sheet only while the
 * modifier is held, so these rules cost nothing the rest of the time.
 */
export function compileReverseCss(reach: Readonly<Record<Key, readonly Key[]>>, options: { gateHover?: boolean; layer?: string } = {}): string {
  const gateHover = options.gateHover ?? true;
  const layer = options.layer ?? "entangled.state";
  const keys = Object.keys(reach).sort();
  const hover: string[] = [];
  const focus: string[] = [];
  for (const key of keys) {
    const writers = [...new Set(reach[key])].map((w) => `[data-en-affects~=${cssString(w)}]`);
    if (writers.length === 0) continue;
    const target = `${writers.length === 1 ? writers[0] : `:is(${writers.join(", ")})`}:where([data-en-fx])`;
    for (const [pseudo, out] of [
      [":hover", hover],
      [":focus-visible", focus],
    ] as const) {
      out.push(`:root[data-en-query]:has([data-en-by~=${cssString(key)}]${pseudo}) ${target} {\n  --en-source: 1;\n}`);
    }
  }
  const indent = (rules: string[], by: string) => rules.map((r) => r.replace(/^/gm, by)).join("\n");
  const parts = [`/* @entangled-ui/core reverse query: ${keys.length} reader keys */`, `@layer ${layer} {`];
  if (hover.length) parts.push(gateHover ? `  @media (hover: hover) {\n${indent(hover, "    ")}\n  }` : indent(hover, "  "));
  if (focus.length) parts.push(indent(focus, "  "));
  parts.push("}");
  return `${parts.join("\n")}\n`;
}

const TEXT_INPUTS = new Set(["button", "submit", "reset", "image", "checkbox", "radio", "range", "color", "file"]);

/** Focus is somewhere typing happens: a modifier there belongs to the text, not to us. */
export function isEditable(el: Element | null): boolean {
  if (!el) return false;
  if ((el as HTMLElement).isContentEditable || el.closest('[contenteditable]:not([contenteditable="false"])')) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  return tag === "INPUT" && !TEXT_INPUTS.has((el as HTMLInputElement).type);
}
