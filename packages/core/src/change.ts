import { type Key, parseKey } from "./key.js";

/**
 * The change grammar: a preview says *what* a control reaches, a change also
 * says *how*. Kinds are drawn with forms that don't rely on colour (dashed,
 * dotted, `+`/`-` chips), so every kind survives forced colours.
 */

/** What happens to the thing a key names. */
export type ChangeKind = "add" | "remove" | "move" | "modify" | "enable" | "disable" | "invalidate";

/** One change a control would make (preview) or made (confirm). */
export interface Change {
  /** The key whose readers this change reaches. */
  readonly key: Key;
  /** Default "modify". */
  readonly kind?: ChangeKind;
  /** Chip text, e.g. "+2.0s" or "-$12". Shown on positioned readers (see presets `deltaCss`). */
  readonly label?: string;
  /** Previous value, for formatters and announcements. */
  readonly from?: unknown;
  /** New value, for formatters and announcements. */
  readonly to?: unknown;
  /** "may": the control can't tell for sure (drawn weaker, never solid). Default "will". */
  readonly certainty?: "will" | "may";
}

/** Several changes, e.g. what one action does. */
export type ChangeSet = readonly Change[];
/** Anything `preview()` / `confirm()` accept: a key, keys, changes, or a mix. */
export type ChangeInput = Key | ReadonlyArray<Key | Change>;
/** Whether a reader's text is for a change it would see (`preview`) or one it saw (`confirm`). */
export type FormatPhase = "preview" | "confirm";

const RANK: Record<ChangeKind, number> = { remove: 7, add: 6, disable: 5, enable: 4, move: 3, modify: 2, invalidate: 1 };

/** All kinds, in precedence order (highest first): see `changeRank`. */
export const CHANGE_KINDS: readonly ChangeKind[] = Object.freeze(["remove", "add", "disable", "enable", "move", "modify", "invalidate"]);

/**
 * Precedence when one element is reached by several changes: the higher rank
 * is drawn, from `remove` (7) down to `invalidate` (1); `undefined` counts as `modify` (2).
 */
export const changeRank = (kind: ChangeKind | undefined): number => RANK[kind ?? "modify"];

const isKind = (s: string): s is ChangeKind => Object.hasOwn(RANK, s);

/**
 * Normalize a key, keys or changes into changes. Throws `InvalidKeyError` for a malformed key,
 * `TypeError` for an unknown kind.
 */
export function toChanges(input: ChangeInput): Change[] {
  const list = typeof input === "string" ? [input] : input;
  return list.map((x) => {
    const c: Change = typeof x === "string" ? { key: x } : x;
    parseKey(c.key);
    if (c.kind !== undefined && !isKind(c.kind)) throw new TypeError(`[entangled] Invalid change kind "${c.kind}"`);
    return c;
  });
}

/**
 * Parse `data-en-change` on a writer: space-separated tokens, each a bare
 * kind (every key of the writer) or `<kind>:<key>` (one of the writer's
 * keys). Returns one change per writer key; bad tokens go to `onInvalid`.
 */
export function parseChangeAttr(
  value: string | null,
  writerKeys: readonly Key[],
  onInvalid?: (token: string) => void,
): Change[] {
  let all: ChangeKind | undefined;
  const per = new Map<Key, ChangeKind>();
  for (const t of value?.split(/\s+/) ?? []) {
    if (!t) continue;
    if (isKind(t)) {
      all = t;
      continue;
    }
    const i = t.indexOf(":");
    const kind = t.slice(0, i);
    const key = t.slice(i + 1);
    if (i > 0 && isKind(kind) && writerKeys.includes(key)) per.set(key, kind);
    else onInvalid?.(t);
  }
  return writerKeys.map((key) => {
    const kind = per.get(key) ?? all;
    return kind ? { key, kind } : { key };
  });
}
