import { ATTR } from "./dom.js";
import type { Graph } from "./graph.js";
import type { Key } from "./key.js";
import {
  type PeekRejection,
  type PeekTokenDefinition,
  type PeekTokenSet,
  compilePeekCss,
  registerPeekProperties,
  validatePeekTokens,
} from "./peek.js";
import type { StyleHost } from "./styles.js";

export interface TokenPeekDeps {
  graph: Graph<Element>;
  /** Readers drawn by the global overlay (`<html>`, `<body>`, `veil`). */
  overlayReaders: () => ReadonlySet<Element>;
  styles: () => StyleHost | null;
  maxAmount: number | undefined;
  /** Elements in the document, and the size above which a global peek is skipped. */
  domNodes: () => number;
  maxGlobalNodes: number;
  gateHover: boolean;
  habituation: boolean;
  warn: (rejection: PeekRejection) => void;
}

/**
 * Runtime side of Token Peek: the registered token sets, each key's current
 * state (from writers' `data-en-value`), and the compiled `peek` sheet.
 * Recompiles only when a definition, a current state or the graph changes:
 * never on hover.
 */
export function createTokenPeek(deps: TokenPeekDeps) {
  const sets = new Map<Key, PeekTokenSet>();
  const current = new Map<Key, string>();
  const rejected: PeekRejection[] = [];
  /** Which key peeks each token: a token can only blend toward one key's states. */
  const owners = new Map<string, Key>();
  let css = "";
  let scheduled = false;

  function scopeOf(set: PeekTokenSet): "global" | "readers" {
    if (set.scope !== "auto") return set.scope;
    const readers = deps.graph.readersOf(set.key);
    if (readers.size === 0) return "global";
    const overlay = deps.overlayReaders();
    for (const r of readers) if (overlay.has(r)) return "global";
    return "readers";
  }

  /**
   * The most recently changed `data-en-value`, else any writer's, else (for
   * two-state keys) the state a writer isn't offering to switch to.
   */
  function currentOf(set: PeekTokenSet): string | undefined {
    const tracked = current.get(set.key);
    if (tracked !== undefined) return tracked;
    const writers = deps.graph.writersOf(set.key);
    for (const w of writers) {
      const value = w.getAttribute(ATTR.value);
      if (value !== null) return value;
    }
    if (set.states.length !== 2) return undefined;
    for (const w of writers) {
      const next = w.getAttribute(ATTR.next);
      if (next !== null && set.states.includes(next)) return set.states.find((s) => s !== next);
    }
    return undefined;
  }

  function compile() {
    scheduled = false;
    const styles = deps.styles();
    if (!styles) return;
    if (sets.size === 0) {
      if (css) styles.remove("peek");
      css = "";
      return;
    }
    let big: boolean | undefined;
    const next = compilePeekCss(
      [...sets.values()].map((set) => {
        const scope = scopeOf(set);
        // Too large to restyle on hover: keep the tokens, skip the blend.
        const peek = scope !== "global" || !(big ??= deps.domNodes() > deps.maxGlobalNodes);
        return { set, scope, current: currentOf(set), peek };
      }),
      { maxAmount: deps.maxAmount, gateHover: deps.gateHover, habituation: deps.habituation },
    );
    if (next !== css) {
      css = next;
      styles.set("peek", css);
    }
  }

  function schedule() {
    if (scheduled || sets.size === 0) return;
    scheduled = true;
    queueMicrotask(compile);
  }

  return {
    get size() {
      return sets.size;
    },
    get rejected(): readonly PeekRejection[] {
      return rejected;
    },
    sets: (): readonly PeekTokenSet[] => [...sets.values()],
    define(def: PeekTokenDefinition): () => void {
      const { set, rejected: bad } = validatePeekTokens(def);
      const accepted = set.tokens.filter((t) => {
        const owner = owners.get(t.name);
        if (owner === undefined || owner === set.key) return true;
        bad.push({ key: set.key, token: t.name, reason: `already peeks for key "${owner}"` });
        return false;
      });
      for (const r of bad) {
        rejected.push(r);
        deps.warn(r);
      }
      const final: PeekTokenSet = { ...set, tokens: accepted };
      sets.set(set.key, final);
      for (const t of accepted) owners.set(t.name, set.key);
      registerPeekProperties(accepted);
      schedule();
      return () => {
        if (sets.get(set.key) !== final) return;
        sets.delete(set.key);
        for (const t of accepted) if (owners.get(t.name) === set.key) owners.delete(t.name);
        if (sets.size === 0) compile();
        else schedule();
      };
    },
    /** A writer's `data-en-value`/`data-en-next` changed (or was scanned). */
    onAttr(el: Element) {
      if (sets.size === 0) return;
      const value = el.getAttribute(ATTR.value);
      let touched = false;
      for (const k of deps.graph.keysOf(el, "writer")) {
        if (!sets.has(k)) continue;
        touched = true;
        if (value !== null) current.set(k, value);
      }
      if (touched) schedule();
    },
    /** Re-resolve scopes after graph changes. */
    graphChanged: schedule,
    /** Apply now (e.g. right after start). */
    flush: compile,
    destroy() {
      deps.styles()?.remove("peek");
      css = "";
      current.clear();
    },
  };
}

export type TokenPeek = ReturnType<typeof createTokenPeek>;
