import { cssString, readerSelectors } from "./compiler.js";
import { habituationVar } from "./habituation.js";
import { type Key, parseKey } from "./key.js";

/**
 * Peek: on preview, blend a small fraction of the *future* state into the
 * affected elements, so users see how they will change, not only that they will.
 *
 * Tier 1 (this module) works on CSS custom properties and runs no JavaScript
 * on hover: hovering a writer whose `data-en-next` names a state blends each
 * registered token toward that state's value.
 */

/** Paint-only syntaxes. Anything else could move layout and is rejected. */
export type PeekSyntax = "<color>" | "<percentage>" | "<number>";
const SYNTAXES: ReadonlySet<string> = new Set<PeekSyntax>(["<color>", "<percentage>", "<number>"]);

/** One token's full spec. */
export interface PeekTokenSpec {
  /** Default `"<color>"`. `<percentage>`/`<number>` are for opacity and filter amounts only. */
  syntax?: string;
  /** Token value per state value of the key (`{ light: "...", dark: "..." }`). */
  values: Readonly<Record<string, string>>;
  /** Set when the token feeds anything that affects layout: the token is then rejected. */
  layout?: boolean;
}

/** Peek tokens for one key, as passed to `definePeekTokens`. */
export interface PeekTokenDefinition {
  /** A concrete key (no wildcards). */
  key: Key;
  /** Token name -> values per state (a plain map means `<color>`). */
  tokens: Readonly<Record<string, Readonly<Record<string, string>> | PeekTokenSpec>>;
  /** State before any writer reports one (`data-en-value`). Default: the first state listed. */
  initial?: string;
  /**
   * `"global"`: tokens live on `:root`. `"readers"`: only on the key's readers.
   * `"auto"` (default): global when the key's readers include `<html>`/`<body>`
   * (or the key has no readers), otherwise readers.
   */
  scope?: "auto" | "global" | "readers";
}

/** An accepted token. */
export interface PeekToken {
  /** Custom property name (`--bg`). */
  name: string;
  /** Registered syntax. */
  syntax: PeekSyntax;
  /** Value per state. */
  values: Readonly<Record<string, string>>;
}

/** A validated definition: only accepted tokens. */
export interface PeekTokenSet {
  /** The concrete key. */
  key: Key;
  /** Accepted tokens. */
  tokens: readonly PeekToken[];
  /** Every state named by any token, in first-seen order. */
  states: readonly string[];
  /** As in the definition. */
  initial: string | undefined;
  /** As in the definition. Default `"auto"`. */
  scope: "auto" | "global" | "readers";
}

/** A token that was refused, and why. */
export interface PeekRejection {
  /** Key of the definition. */
  key: Key;
  /** Token name. */
  token: string;
  /** Human-readable reason. */
  reason: string;
}

/** Thrown when a definition's key can't peek (wildcards). */
export class PeekTokenError extends Error {
  constructor(message: string) {
    super(`[entangled] ${message}`);
    this.name = "PeekTokenError";
  }
}

const TOKEN_NAME = /^--[A-Za-z_][\w-]*$/;
const NUMBER = /^-?(\d+\.?\d*|\.\d+)$/;
const PERCENTAGE = /^-?(\d+\.?\d*|\.\d+)%$/;
/** Characters that could end a declaration or block: never allowed in a value. */
const UNSAFE = /[;{}<>]|\/\*/;

function checkValue(syntax: PeekSyntax, value: string): string | null {
  if (typeof value !== "string" || !value.trim()) return "empty value";
  if (UNSAFE.test(value)) return `unsafe characters in "${value}"`;
  if (syntax === "<number>" && !NUMBER.test(value.trim())) return `"${value}" is not a <number>`;
  if (syntax === "<percentage>" && !PERCENTAGE.test(value.trim())) return `"${value}" is not a <percentage>`;
  if (syntax === "<color>" && typeof CSS !== "undefined" && typeof CSS.supports === "function") {
    try {
      if (!value.includes("var(") && !CSS.supports("color", value)) return `"${value}" is not a <color>`;
    } catch {
      /* no CSS parser: accept */
    }
  }
  return null;
}

/**
 * Validate a definition. Never throws for token problems: unsafe tokens are
 * returned in `rejected` (the runtime warns and lists them for DevTools).
 * Throws `PeekTokenError` only when the key itself can't peek.
 */
export function validatePeekTokens(def: PeekTokenDefinition): { set: PeekTokenSet; rejected: PeekRejection[] } {
  const p = parseKey(def.key);
  if (p.wildcard) throw new PeekTokenError(`peek keys must be concrete, got "${def.key}"`);
  const tokens: PeekToken[] = [];
  const rejected: PeekRejection[] = [];
  const states: string[] = [];
  for (const [name, input] of Object.entries(def.tokens)) {
    const spec: PeekTokenSpec =
      input && typeof (input as PeekTokenSpec).values === "object"
        ? (input as PeekTokenSpec)
        : { values: input as Record<string, string> };
    const reject = (reason: string) => rejected.push({ key: def.key, token: name, reason });
    if (!TOKEN_NAME.test(name)) {
      reject("token names must be custom properties (`--name`)");
      continue;
    }
    const syntax = (spec.syntax ?? "<color>").trim();
    if (spec.layout) {
      reject("flagged as layout-affecting: only paint-only tokens may peek");
      continue;
    }
    if (!SYNTAXES.has(syntax)) {
      reject(`syntax ${syntax} may affect layout: only <color>, <percentage> and <number> may peek`);
      continue;
    }
    const entries = Object.entries(spec.values ?? {});
    if (entries.length < 2) {
      reject("needs a value for at least two states");
      continue;
    }
    const problem = entries.map(([, v]) => checkValue(syntax as PeekSyntax, v)).find(Boolean);
    if (problem) {
      reject(problem);
      continue;
    }
    for (const [state] of entries) if (!states.includes(state)) states.push(state);
    tokens.push({ name, syntax: syntax as PeekSyntax, values: Object.fromEntries(entries) });
  }
  return {
    set: { key: def.key, tokens, states, initial: def.initial, scope: def.scope ?? "auto" },
    rejected,
  };
}

/** Default blend amount toward the next state. */
export const PEEK_AMOUNT = 0.15;
/** Hard cap on the blend: a peek must never be mistaken for the change itself. */
export const PEEK_MAX_AMOUNT = 0.35;

/** One key's input to `compilePeekCss`. */
export interface PeekCompileEntry {
  /** Validated tokens. */
  set: PeekTokenSet;
  /** Resolved scope (the runtime decides `"auto"` from the graph). */
  scope: "global" | "readers";
  /** The key's current state. Default: `set.initial`, else the first state. */
  current?: string;
  /** `false`: emit only the tokens' current values, no hover blend. Default true. */
  peek?: boolean;
}

/**
 * A global peek restyles the whole document once in and once out, at about
 * 1.5 us per element in Chromium. Above this many elements a step costs more
 * than ~6ms, so the runtime skips the blend.
 */
export const PEEK_MAX_GLOBAL_NODES = 4000;

/** Output options for `compilePeekCss`. */
export interface PeekCompileOptions {
  /**
   * Upper bound for `--en-peek-amount`, itself capped at `PEEK_MAX_AMOUNT`. Default
   * `PEEK_MAX_AMOUNT`.
   */
  maxAmount?: number;
  /** As in `compileGraphCss`. Default true. */
  gateHover?: boolean;
  /** Default `"entangled.state"`. */
  layer?: string;
  /** Scale each key's blend by its habituation multiplier (`--en-pint-<key>`). Default false. */
  habituation?: boolean;
}

const EASE = "cubic-bezier(0.2, 0, 0, 1)";
const round = (n: number) => Math.round(n * 1000) / 1000;
const INITIAL: Record<PeekSyntax, string> = { "<color>": "transparent", "<percentage>": "0%", "<number>": "0" };

/** Internal base/next property names for a token: `--bg` -> `--en-base-bg` / `--en-next-bg`. */
export const peekVars = (token: string) => ({ base: `--en-base-${token.slice(2)}`, next: `--en-next-${token.slice(2)}` });

function blend(token: PeekToken, t: string): string {
  const { base, next } = peekVars(token.name);
  const b = `var(${base})`;
  const n = `var(${next}, ${b})`;
  return token.syntax === "<color>"
    ? `color-mix(in oklch, ${b}, ${n} calc(${t} * 100%))`
    : `calc(${b} + (${n} - ${b}) * ${t})`;
}

/**
 * Compile token peek rules. Pure and deterministic.
 *
 * Per token: an `@property` registration, a base declaration on the scope
 * (`:root` or the key's readers) holding the current state's value, and the
 * consumed token itself as a blend toward `--en-next-*`. Per state: one rule
 * keyed on the hovered/focused writer's `data-en-next` that sets the next
 * values and `--en-peek: 1`. `--en-peek` transitions after the dwell, so a
 * pass-through hover blends nothing.
 */
export function compilePeekCss(entries: readonly PeekCompileEntry[], options: PeekCompileOptions = {}): string {
  const gateHover = options.gateHover ?? true;
  const layer = options.layer ?? "entangled.state";
  const cap = round(Math.max(0, Math.min(options.maxAmount ?? PEEK_MAX_AMOUNT, PEEK_MAX_AMOUNT)));
  const amount = `var(--en-peek) * min(var(--en-peek-amount, ${PEEK_AMOUNT}), ${cap})`;
  const sorted = [...entries].sort((a, b) => (a.set.key < b.set.key ? -1 : a.set.key > b.set.key ? 1 : 0));

  const props: string[] = [];
  const bases: string[] = [];
  const hover: string[] = [];
  const focus: string[] = [];
  let anyGlobal = false;
  let tokenCount = 0;
  for (const { set, scope, current, peek = true } of sorted) {
    if (set.tokens.length === 0) continue;
    tokenCount += set.tokens.length;
    const state = current !== undefined && set.states.includes(current) ? current : (set.initial ?? set.states[0]);
    const t = options.habituation ? `${amount} * var(${habituationVar(set.key, "peek")}, 1)` : amount;
    const readers = readerSelectors(set.key);
    const target = scope === "global" ? ":root" : `:where(${readers.join(", ")})`;
    const decl: string[] = [];
    for (const token of set.tokens) {
      props.push(`@property ${token.name} {\n  syntax: "${token.syntax}";\n  inherits: true;\n  initial-value: ${INITIAL[token.syntax]};\n}`);
      const value = state !== undefined ? token.values[state] : undefined;
      if (value !== undefined) decl.push(`  ${peekVars(token.name).base}: ${value};`);
      decl.push(`  ${token.name}: ${blend(token, t)};`);
    }
    bases.push(`${target} {\n${decl.join("\n")}\n}`);
    if (!peek) continue;
    for (const next of set.states) {
      if (next === state) continue;
      const values = set.tokens
        .filter((tk) => tk.values[next] !== undefined)
        .map((tk) => `  ${peekVars(tk.name).next}: ${tk.values[next]};`);
      if (values.length === 0) continue;
      const writer = `[data-en-affects~=${cssString(set.key)}][data-en-next=${cssString(next)}]`;
      // Readers transition --en-peek through the preset's [data-en-fx] rule; :root needs its own.
      // Animating :root tokens restyles the whole document every frame, so a
      // global peek steps in after the dwell unless --en-peek-duration opts
      // into a fade.
      const transition =
        scope === "global"
          ? [`  transition: --en-peek var(--_en-peek-duration, var(--en-peek-duration, 0s)) ${EASE} var(--en-dwell);`]
          : [];
      for (const [pseudo, out] of [
        [":hover", hover],
        [":focus-visible", focus],
      ] as const) {
        const scopeSel = `:root:has(${writer}${pseudo})`;
        const sel = scope === "global" ? scopeSel : `${scopeSel} ${target}`;
        out.push(`${sel} {\n  --en-peek: 1;\n${values.join("\n")}\n${transition.join("\n")}`.trimEnd() + "\n}");
      }
    }
    anyGlobal ||= scope === "global";
  }

  const indent = (rules: string[], by: string) => rules.map((r) => r.replace(/^/gm, by)).join("\n");
  const parts = [`/* @entangled-ui/core peek: ${sorted.length} keys, ${tokenCount} tokens */`, ...[...new Set(props)]];
  parts.push(`@layer ${layer} {`);
  if (bases.length) parts.push(indent(bases, "  "));
  if (hover.length) parts.push(gateHover ? `  @media (hover: hover) {\n${indent(hover, "    ")}\n  }` : indent(hover, "  "));
  if (focus.length) parts.push(indent(focus, "  "));
  // Reduced motion: peek is not motion, so it still applies, but instantly.
  if (anyGlobal) {
    parts.push(
      `  @media (prefers-reduced-motion: reduce) {\n    :root:not([data-en-motion="full"]) {\n      --_en-peek-duration: 0s;\n    }\n  }`,
    );
  }
  parts.push("}");
  return `${parts.join("\n")}\n`;
}

const registered = new Set<string>();

/**
 * Register peek properties so they can transition and compute once where
 * declared. JS registration as well as `@property`, because `@property` in
 * constructed stylesheets is not honoured by every engine. Registration
 * can't be undone; re-registering is a no-op.
 */
export function registerPeekProperties(tokens: readonly PeekToken[]): void {
  if (typeof CSS === "undefined" || typeof CSS.registerProperty !== "function") return;
  for (const t of tokens) {
    if (registered.has(t.name)) continue;
    registered.add(t.name);
    try {
      CSS.registerProperty({ name: t.name, syntax: t.syntax, inherits: true, initialValue: INITIAL[t.syntax] });
    } catch {
      // Already registered (e.g. by @property) or unsupported: both fine.
    }
  }
}

/**
 * Pivot `{ light: { "--bg": ... }, dark: { "--bg": ... } }` into a token map, e.g. from Tailwind
 * theme values.
 */
export function peekTokensByState(
  states: Readonly<Record<string, Readonly<Record<string, string>>>>,
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const [state, tokens] of Object.entries(states)) {
    for (const [name, value] of Object.entries(tokens)) (out[name] ??= {})[state] = value;
  }
  return out;
}
