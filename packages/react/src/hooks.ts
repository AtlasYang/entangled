import type {
  AttentionLevel,
  ChangeInput,
  ChangeKind,
  Channel,
  ConfirmOptions,
  EntangledRuntime,
  ForeseeOptions,
  ForesightPlan,
  Key,
  Paint,
  PeekTokenDefinition,
  PreviewOptions,
  Severity,
} from "@entangled-ui/core";
import {
  type RefCallback,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { NodeContext, useEntangledContext } from "./context.js";

type KeyList = Key | readonly Key[];

/** What an element writes or reads, and how its effects behave. */
export interface EntangledDeclaration {
  /** Keys this control writes; the record form also gives each key's change kind. */
  affects?: KeyList | Readonly<Record<Key, ChangeKind>>;
  /** How every key changes (`data-en-change`); per-key kinds in `affects` win. */
  change?: ChangeKind;
  /**
   * `"destructive"`: caution tone, and the preview passes the `minimal` level (`data-en-severity`).
   */
  severity?: Severity;
  /** Keys this element's appearance depends on. */
  by?: KeyList;
  /** Effect preset override. */
  effect?: string;
  /** Attention-budget priority; higher wins. */
  priority?: number;
  /** Host is positioned and has no own `::after`: enables layered effects. */
  layer?: boolean;
  /** Host is positioned and has no own `::before`: names the actor of peer changes. */
  badge?: boolean;
  /**
   * `"manual"`: don't confirm on click/change; call `confirm()` yourself.
   * `"auto"`: confirm on activation even where the profile doesn't (`profile: "app"`).
   */
  confirm?: "auto" | "manual";
  /** Peek: this writer's current state (`data-en-value`). */
  value?: string | number | boolean;
  /** Peek: the state this writer would switch to (`data-en-next`). */
  next?: string | number | boolean;
  /**
   * Drag: keys a dragged writer previews instead of `affects` (`data-en-drop`, with `dragSensor`).
   */
  drop?: KeyList;
  /** Visual channels the host already uses, which effects avoid (`data-en-channel`). */
  channel?: Channel | readonly Channel[];
  /** SVG paints the `stroke` preset may colour (`data-en-paint`). */
  paint?: Paint | readonly Paint[];
}

/** Plain attributes: spread onto any element. Server-renderable. */
export interface EntangledProps {
  /** Space-separated writer keys (`affects`). */
  "data-en-affects"?: string;
  /** Space-separated reader keys (`by`). */
  "data-en-by"?: string;
  /** Effect preset override (`effect`). */
  "data-en-effect"?: string;
  /** Attention-budget priority (`priority`). */
  "data-en-priority"?: number;
  /** Present when `layer` is set. */
  "data-en-layer"?: "";
  /** Present when `badge` is set. */
  "data-en-badge"?: "";
  /** `confirm`, when set. */
  "data-en-confirm"?: "manual" | "auto";
  /** Peek: current state (`value`). */
  "data-en-value"?: string;
  /** Peek: next state (`next`). */
  "data-en-next"?: string;
  /** Space-separated drop keys (`drop`). */
  "data-en-drop"?: string;
  /** Change kinds (`change`, and the record form of `affects`). */
  "data-en-change"?: string;
  /** `severity`. */
  "data-en-severity"?: "destructive";
  /** Space-separated channels (`channel`). */
  "data-en-channel"?: string;
  /** Space-separated paints (`paint`). */
  "data-en-paint"?: string;
}

/**
 * Attributes plus a ref, for one element. For the state hooks
 * (`useEntangledState`, `useEntangledValue`, `useEntangledStore`), a ref that
 * is never attached registers the key on the nearest `<EntangledNode>` instead.
 */
export type EntangledBind = EntangledProps & { ref: RefCallback<Element> };

const join = (k: string | readonly string[] | undefined) =>
  k === undefined ? undefined : typeof k === "string" ? k : k.join(" ") || undefined;

const isKeyList = (a: EntangledDeclaration["affects"]): a is KeyList | undefined => a === undefined || typeof a === "string" || Array.isArray(a);
/** The writer keys of `affects`, joined. */
const affectsKeys = (a: EntangledDeclaration["affects"]) => join(isKeyList(a) ? a : Object.keys(a));
/** `data-en-change`: the bare kind, then one `kind:key` per record entry. */
const changeAttr = (d: EntangledDeclaration) =>
  [d.change, ...(isKeyList(d.affects) ? [] : Object.entries(d.affects).map(([k, kind]) => `${kind}:${k}`))]
    .filter(Boolean)
    .join(" ") || undefined;

/** Pure mapping from a declaration to `data-en-*` attributes. */
export function entangledProps(d: EntangledDeclaration): EntangledProps {
  const props: EntangledProps = {};
  const affects = affectsKeys(d.affects);
  const by = join(d.by);
  if (affects) props["data-en-affects"] = affects;
  if (by) props["data-en-by"] = by;
  if (d.effect) props["data-en-effect"] = d.effect;
  if (d.priority !== undefined) props["data-en-priority"] = d.priority;
  if (d.layer) props["data-en-layer"] = "";
  if (d.badge) props["data-en-badge"] = "";
  if (d.confirm) props["data-en-confirm"] = d.confirm;
  const change = changeAttr(d);
  if (change) props["data-en-change"] = change;
  if (d.severity) props["data-en-severity"] = d.severity;
  if (d.value !== undefined) props["data-en-value"] = String(d.value);
  if (d.next !== undefined) props["data-en-next"] = String(d.next);
  const drop = join(d.drop);
  if (drop) props["data-en-drop"] = drop;
  const channel = join(d.channel);
  if (channel) props["data-en-channel"] = channel;
  const paint = join(d.paint);
  if (paint) props["data-en-paint"] = paint;
  return props;
}

/**
 * Declare what an element affects or depends on.
 * Returns stable attribute props; hovering never re-renders.
 *
 * @example <button {...useEntangled({ affects: "theme" })}>Toggle</button>
 */
export function useEntangled(d: EntangledDeclaration): EntangledProps {
  const affects = affectsKeys(d.affects);
  const change = changeAttr(d);
  const by = join(d.by);
  const drop = join(d.drop);
  const channel = join(d.channel) as Channel | undefined;
  const paint = join(d.paint) as Paint | undefined;
  return useMemo(() => {
    const props = entangledProps({
      affects,
      by,
      effect: d.effect,
      priority: d.priority,
      layer: d.layer,
      badge: d.badge,
      confirm: d.confirm,
      value: d.value,
      next: d.next,
      drop,
      channel,
      paint,
      severity: d.severity,
    });
    if (change) props["data-en-change"] = change;
    return props;
  }, [affects, by, d.effect, d.priority, d.layer, d.badge, d.confirm, d.value, d.next, drop, channel, paint, d.severity, change]);
}

/** Returned by `useEntangle`. */
export interface EntangleApi {
  /** Play the confirm effect on everything that reads the changed keys. */
  confirm(changes: ChangeInput, options?: ConfirmOptions): void;
  /** Programmatic preview of keys or changes; returns a function that ends it. */
  preview(changes: ChangeInput, options?: PreviewOptions): () => void;
  /** Add or replace an effect preset (`[data-en-fx="<name>"]`). */
  registerEffect(name: string, css: string): void;
  /**
   * Token Peek: tokens to blend toward a previewed writer's next state. Returns an unregister
   * function.
   */
  definePeekTokens(def: PeekTokenDefinition): () => void;
  /** Switch the attention level (see `runtime.setLevel`). */
  setLevel(level: AttentionLevel): void;
  /** A writer whose effect is worked out when it is looked at (see `runtime.foresee`). */
  foresee(el: Element, plan: ForesightPlan, options?: ForeseeOptions): () => void;
  /** The Provider's runtime. */
  runtime: EntangledRuntime;
}

/** Imperative access: `useEntangle().confirm("media:42")`. */
export function useEntangle(): EntangleApi {
  const { runtime } = useEntangledContext("useEntangle");
  return useMemo(
    () => ({
      confirm: (key, options) => runtime.confirm(key, options),
      preview: (key, options) => runtime.preview(key, options),
      registerEffect: (name, css) => runtime.registerEffect(name, css),
      definePeekTokens: (def) => runtime.definePeekTokens(def),
      setLevel: (level) => runtime.setLevel(level),
      foresee: (el, plan, options) => runtime.foresee(el, plan, options),
      runtime,
    }),
    [runtime],
  );
}

/**
 * The runtime's attention level and a setter, e.g. for a "Show cues" menu.
 * Re-renders only when the level changes.
 *
 * @example const [level, setLevel] = useAttentionLevel();
 */
export function useAttentionLevel(): [level: AttentionLevel, setLevel: (level: AttentionLevel) => void] {
  const { runtime } = useEntangledContext("useAttentionLevel");
  const subscribe = useCallback(
    (onChange: () => void) =>
      runtime.onEvent((e) => {
        if (e.type === "level") onChange();
      }),
    [runtime],
  );
  const read = () => runtime.level;
  const level = useSyncExternalStore(subscribe, read, read);
  const set = useCallback((next: AttentionLevel) => runtime.setLevel(next), [runtime]);
  return [level, set];
}

/**
 * A writer whose effect is worked out when it is looked at (after the dwell):
 * `plan` returns the changes it would make then (a `ChangeSet` from
 * `createPlanner`, keys, or `null` for nothing). `key` names the control
 * itself. It confirms manually: confirm what the action actually did once it's
 * done. Spread the bind onto one element. Hovering never re-renders.
 *
 * @example <button {...useForesight("edit:undo", () => plan(undo()))}>Undo</button>
 */
export function useForesight(key: Key, plan: ForesightPlan, options?: ForeseeOptions): EntangledBind {
  const { runtime } = useEntangledContext("useForesight");
  const latest = useRef({ plan, options });
  latest.current = { plan, options };
  const { severity, budgetMs, deviation } = options ?? {};
  const hasRevision = options?.revision !== undefined;
  const dispose = useRef<(() => void) | null>(null);
  const ref = useCallback<RefCallback<Element>>(
    (el) => {
      dispose.current?.();
      dispose.current = el
        ? runtime.foresee(el, () => latest.current.plan(), {
            severity,
            budgetMs,
            deviation,
            revision: hasRevision ? () => latest.current.options?.revision?.() : undefined,
          })
        : null;
    },
    [runtime, severity, budgetMs, deviation, hasRevision],
  );
  return useMemo<EntangledBind>(
    () => ({ ref, "data-en-affects": key, "data-en-confirm": "manual", ...(severity ? { "data-en-severity": severity } : {}) }),
    [ref, key, severity],
  );
}

/**
 * `useForesight` for elements a hook can't reach (menu items built on open).
 * Uses React 19 ref cleanup; in React 18 use `useForesight`.
 *
 * @example
 * <MenuItem
 *   {...foresightProps(runtime, "menu:delete", () => plan(remove(id)), {
 *     severity: "destructive",
 *   })}
 * />
 */
export function foresightProps(
  runtime: EntangledRuntime,
  key: Key,
  plan: ForesightPlan,
  options?: ForeseeOptions,
): {
  ref: (el: Element | null) => (() => void) | undefined;
  "data-en-affects": string;
  "data-en-confirm": "manual";
  "data-en-severity"?: "destructive";
} {
  return {
    ref: (el) => (el ? runtime.foresee(el, plan, options) : undefined),
    "data-en-affects": key,
    "data-en-confirm": "manual",
    ...(options?.severity ? { "data-en-severity": options.severity } : {}),
  };
}

/**
 * A bind for `role`/`key`. If the returned ref is never attached to an
 * element, the key is registered on the nearest `<EntangledNode>` instead.
 */
function useBind(role: "writer" | "reader", key: Key, extra: EntangledProps) {
  const node = useContext(NodeContext);
  const el = useRef<Element | null>(null);
  const ref = useCallback<RefCallback<Element>>((e) => {
    el.current = e;
  }, []);
  // Ref callbacks run during commit, before effects, so `el.current` is already set here when the
  // bind was spread onto an element.
  useEffect(() => {
    if (el.current || !node) return;
    return node.add(role, key);
  }, [node, role, key]);
  const { "data-en-confirm": confirm, "data-en-value": value, "data-en-next": next } = extra;
  const bind = useMemo<EntangledBind>(
    () => ({
      ref,
      ...(role === "writer" ? { "data-en-affects": key } : { "data-en-by": key }),
      ...(confirm ? { "data-en-confirm": confirm } : {}),
      ...(value !== undefined ? { "data-en-value": value } : {}),
      ...(next !== undefined ? { "data-en-next": next } : {}),
    }),
    [ref, role, key, confirm, value, next],
  );
  const source = useCallback(() => el.current ?? node?.element() ?? null, [node]);
  return [bind, source] as const;
}

type SetStateAction<T> = T | ((prev: T) => T);

/**
 * How a state change is confirmed. `origin` is inferred when omitted: `self`
 * right after trusted user input, otherwise `system`. Pass `"peer"` (and an
 * `actor`) for changes that arrive from collaborators.
 */
export type SetOptions = Pick<ConfirmOptions, "origin" | "actor" | "announce" | "intensity" | "durationMs" | "notify" | "severity">;

/** Options for `useEntangledState`. */
export interface EntangledStateOptions<T> {
  /**
   * Peek: the value this control would set next, shown before it's used.
   * Booleans default to the opposite value. It becomes `data-en-next` (for
   * Token Peek) and is what `peekDelta` readers and `usePeekValue` receive.
   */
  previewValue?: (current: T) => T;
}

/** A state value as an attribute, when it has a meaningful string form. */
const attrValue = (v: unknown) =>
  typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? String(v) : undefined;

/**
 * Writer of shared state keyed by `key`. Calling the setter confirms
 * `key` automatically, excluding the bound control itself.
 *
 * @example const [dark, setDark, bindWriter] = useEntangledState("theme", false);
 * @example setDoc(remote.title, { origin: "peer", actor: { id: "u42", name: "Mina" } });
 * @example useEntangledState("discount", 0, { previewValue: (d) => d + 10 });
 */
export function useEntangledState<T>(
  key: Key,
  initial: T,
  options?: EntangledStateOptions<T>,
): [value: T, setValue: (next: SetStateAction<T>, options?: SetOptions) => void, bindWriter: EntangledBind] {
  const { runtime, values } = useEntangledContext("useEntangledState");
  const subscribe = useCallback((l: () => void) => values.subscribe(key, l), [values, key]);
  const read = () => (values.has(key) ? (values.get(key) as T) : initial);
  const value = useSyncExternalStore(subscribe, read, read);
  const preview = useRef(options?.previewValue);
  preview.current = options?.previewValue;
  const nextOf = useCallback(
    (v: T): T | undefined => (preview.current ? preview.current(v) : typeof v === "boolean" ? (!v as T) : undefined),
    [],
  );
  const next = nextOf(value);
  // The setter already confirms; skip the activation sensor's auto-confirm.
  // data-en-value/next change only with the value, never on hover.
  const [bind, source] = useBind("writer", key, {
    "data-en-confirm": "manual",
    "data-en-value": attrValue(value),
    "data-en-next": attrValue(next),
  });
  const latest = useRef(value);
  latest.current = value;
  const peeks = next !== undefined;
  useEffect(() => {
    const el = peeks ? source() : null;
    if (!el) return;
    return runtime.peekWriter(el, { current: () => latest.current, next: () => nextOf(latest.current) });
  }, [runtime, source, nextOf, peeks]);
  const initialRef = useRef(initial);
  initialRef.current = initial;
  const set = useCallback(
    (next: SetStateAction<T>, options?: SetOptions) => {
      const prev = values.has(key) ? (values.get(key) as T) : initialRef.current;
      const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      if (Object.is(prev, resolved)) return;
      values.set(key, resolved);
      // Only the user's own change was caused by the bound control.
      runtime.confirm(key, { ...options, source: options?.origin === "peer" ? null : source() });
    },
    [values, key, runtime, source],
  );
  return [value, set, bind];
}

/** Options for `useEntangledValue`. */
export interface EntangledValueOptions<T> {
  /**
   * Value Peek: format the change this element would see if a writer of the
   * key set its `previewValue`, e.g. `(cur, next) => "-$12"`. Shown after the
   * dwell as a chip (`data-en-delta`) without a React render. The element
   * must be positioned with no `::after` of its own. Return `null` for no chip.
   */
  peekDelta?: (current: T, next: T) => string | null;
}

/**
 * Reader of shared state: read the value for `key` and get a bind that marks the
 * element as depending on it.
 *
 * @example const [dark, bindReader] = useEntangledValue<boolean>("theme");
 * @example
 * useEntangledValue("discount", 0, {
 *   peekDelta: (cur, next) => euros(price(next) - price(cur)),
 * });
 */
export function useEntangledValue<T>(key: Key): [value: T | undefined, bindReader: EntangledBind];
export function useEntangledValue<T>(
  key: Key,
  fallback: T,
  options?: EntangledValueOptions<T>,
): [value: T, bindReader: EntangledBind];
export function useEntangledValue<T>(key: Key, fallback?: T, options?: EntangledValueOptions<T>): [T | undefined, EntangledBind] {
  const { runtime, values } = useEntangledContext("useEntangledValue");
  const subscribe = useCallback((l: () => void) => values.subscribe(key, l), [values, key]);
  const read = () => (values.has(key) ? (values.get(key) as T) : fallback);
  const value = useSyncExternalStore(subscribe, read, read);
  const [bind, source] = useBind("reader", key, {});
  const delta = useRef(options?.peekDelta);
  delta.current = options?.peekDelta;
  const peeks = options?.peekDelta !== undefined;
  useEffect(() => {
    const el = peeks ? source() : null;
    if (!el) return;
    return runtime.peekReader(el, (cur, next) => delta.current?.(cur as T, next as T) ?? null);
  }, [runtime, source, peeks]);
  return [value, bind];
}

/**
 * Value Peek for custom rendering: the value a writer of `key` would set,
 * while it is previewed (after the dwell), else `undefined`. Only components
 * that call this re-render, and only in a transition.
 *
 * Whatever you render with it must not change layout: reserve its space
 * (fixed size, or `visibility`/`opacity` instead of mounting new boxes).
 */
export function usePeekValue<T>(key: Key): T | undefined {
  const { runtime } = useEntangledContext("usePeekValue");
  const [next, setNext] = useState<T | undefined>(undefined);
  useEffect(
    () => runtime.onPeek(key, (value) => startTransition(() => setNext(value as T | undefined))),
    [runtime, key],
  );
  return next;
}

/** Anything with `subscribe` + `getSnapshot` (Zustand, Jotai store wrappers, Redux, signals...). */
export interface ExternalStore<S> {
  /** Call `onChange` on every change; returns an unsubscribe function. */
  subscribe(onChange: () => void): () => void;
  /** Current state. */
  getSnapshot(): S;
  /** State during SSR and hydration. Default `getSnapshot`. */
  getServerSnapshot?(): S;
}

/**
 * Reader for an external store. `selector` must return a stable value
 * (primitive or memoized) like any `useSyncExternalStore` selector.
 */
export function useEntangledStore<S, R = S>(
  key: Key,
  store: ExternalStore<S>,
  selector: (state: S) => R = (s) => s as unknown as R,
): [value: R, bindReader: EntangledBind] {
  const get = () => selector(store.getSnapshot());
  const getServer = () => selector((store.getServerSnapshot ?? store.getSnapshot)());
  const value = useSyncExternalStore(store.subscribe, get, getServer);
  const [bind] = useBind("reader", key, {});
  return [value, bind];
}

/**
 * Wrap an external store's setter so each call confirms `key`. The control
 * that was just clicked is excluded automatically. `options` apply to every
 * call, e.g. `{ origin: "peer" }` for a realtime sync adapter's setter.
 *
 * @example const setUser = useEntangledSetter("user", useUserStore.setState);
 */
export function useEntangledSetter<A extends unknown[]>(
  key: Key,
  setter: (...args: A) => unknown,
  options?: SetOptions,
): (...args: A) => void {
  const { runtime } = useEntangledContext("useEntangledSetter");
  const latest = useRef({ setter, options });
  latest.current = { setter, options };
  return useCallback(
    (...args: A) => {
      latest.current.setter(...args);
      runtime.confirm(key, latest.current.options);
    },
    [runtime, key],
  );
}
