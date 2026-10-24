import { budgetIntensity, selectTop } from "./budget.js";
import {
  type AttentionLevel,
  type AttentionOptions,
  ATTENTION_LEVELS,
  type NotifyLevel,
  PROFILE_DEFAULTS,
  type Profile,
  type Severity,
  createNotifyResolver,
  readStoredLevel,
  storeLevel,
} from "./attention.js";
import { type AutoModeLimits, chooseMode } from "./auto-mode.js";
import { compileGraphCss } from "./compiler.js";
import { type Change, type ChangeInput, type ChangeKind, type ChangeSet, type FormatPhase, changeRank, parseChangeAttr, toChanges } from "./change.js";
import { type ForeseeOptions, type ForesightPlan, type ForesightResult, compareForesight } from "./foresight.js";
import { ATTR, DomBinding, VARS, WRITER_SELECTOR, routesToOverlay as overlayRouted } from "./dom.js";
import { type Graph, createGraph } from "./graph.js";
import { GLOBAL_KEY, type Key, keyMatches, parseKey } from "./key.js";
import {
  type Actor,
  type Announcer,
  type IntentTracker,
  type Origin,
  type RemoteChange,
  createAnnouncer,
  createIntentTracker,
  defaultAnnouncement,
  isRemote,
} from "./origin.js";
import {
  type Habituation,
  type HabituationOptions,
  type HabituationRecord,
  createHabituation,
  habituationVar,
} from "./habituation.js";
import { PEEK_MAX_GLOBAL_NODES, type PeekRejection, type PeekTokenDefinition } from "./peek.js";
import { type ReverseQueryOptions, compileReverseCss, isEditable, reverseReach, sourcesOf } from "./reverse.js";
import {
  type Sensor,
  type SensorContext,
  activationSensor,
  focusSensor,
  isFocusVisible,
  pointerSensor,
} from "./sensors.js";
import { type TokenPeek, createTokenPeek } from "./token-peek.js";
import { type StyleHost, type StyleSheetSpec, createStyleHost, registerPreviewProperty, wrapEffectCss } from "./styles.js";

/**
 * An element's highlight state: none, previewing a possible change, or confirming one that
 * happened.
 */
export type Salience = "idle" | "preview" | "confirm";
/** How preview is driven: compiled CSS or JavaScript listeners. */
export type Mode = "css" | "js";

/** What the runtime is currently showing on an element (see `getState`). */
export interface SalienceState {
  /** Current salience. A confirm wins over a preview of the same element. */
  state: Salience;
  /** 0-1, after the attention budget. */
  intensity: number;
  /** The key that made this element salient. */
  key: Key | null;
  /** Who caused the change, while confirming; otherwise `null`. */
  origin: Origin | null;
  /** Shown as a source by a reverse query (it controls what's being inspected). */
  source: boolean;
  /** Kind drawn on the element, `null` for plain modify or idle. */
  kind: ChangeKind | null;
  /** Chip text shown on the element, else `null`. */
  label: string | null;
}

/** What the runtime reports to `onEvent` listeners (DevTools). */
export type RuntimeEvent =
  | {
      type: "confirm";
      time: number;
      keys: readonly Key[];
      changes: ChangeSet;
      origin: Origin;
      actor: Actor | undefined;
      shown: number;
    }
  | { type: "budget"; time: number; key: Key; kind: "preview" | "confirm"; candidates: number; shown: number }
  | { type: "graph"; time: number }
  | { type: "query"; time: number; active: boolean }
  | { type: "level"; time: number; level: AttentionLevel; previous: AttentionLevel }
  | { type: "foresight"; time: number; writer: Element; changes: ChangeSet; durationMs: number; cached: boolean; slow: boolean }
  | {
      type: "deviation";
      time: number;
      writer: Element;
      foreseen: ChangeSet;
      actual: ChangeSet;
      unexpected: ChangeSet;
      missing: ChangeSet;
      mismatched: ReadonlyArray<{ foreseen: Change; actual: Change }>;
    };

/** Options for `createEntangled`. */
export interface EntangledOptions {
  /** "site" (default) or "app": a set of defaults, see PROFILE_DEFAULTS. Explicit options win. */
  profile?: Profile;
  /** Default for `ConfirmOptions.includeWriters`. Default by profile (site true, app false). */
  includeWriters?: boolean;
  /** Attention and notify levels. */
  attention?: AttentionOptions;
  /**
   * Foresight defaults: plans slower than `budgetMs` (8) are reported as
   * slow; a confirm within `deviationWindowMs` (1000) of activating a
   * foreseen writer is compared with what was foreseen.
   */
  foresight?: { budgetMs?: number; deviationWindowMs?: number };
  /** Default: `document`, resolved at `start()`. */
  root?: Document | ShadowRoot;
  /**
   * `"js"`: delegated listeners drive preview. `"css"`: the graph is compiled
   * to CSS and hover/focus preview runs with zero JavaScript (needs `:has()`
   * and a Document root; otherwise falls back to JS). `"auto"`: pick by the
   * benchmark-derived criteria. Default by profile: `"auto"` (site), `"js"` (app).
   */
  mode?: "css" | "js" | "auto";
  /** Hover dwell before preview. Default 120. */
  dwellMs?: number;
  /** Confirm duration for `self` changes. Default: the `--en-duration-confirm` token (900ms). */
  confirmMs?: number;
  /**
   * Confirm duration for `peer` and `system` changes: the user didn't cause
   * them, so they get longer to be noticed. Default `1.8 * confirmMs`.
   */
  remoteConfirmMs?: number;
  /**
   * A confirm within this long after a trusted pointer/keyboard event counts
   * as `origin: "self"`; otherwise `"system"`. Default 300.
   */
  originWindowMs?: number;
  /**
   * Burst coalescing: within this window after an afterglow starts, further
   * confirms of the same key and origin merge into it instead of starting a
   * new one, and remote ones that arrive after it faded are absorbed. Default 2000.
   */
  coalesceMs?: number;
  /**
   * Announce `peer`/`system` changes in a polite live region, at most one
   * message per `announceIntervalMs`. `true` uses a default message; a
   * function formats its own (return `null` to stay silent). Default false.
   */
  announceRemoteChanges?: boolean | ((change: RemoteChange) => string | null);
  /** Minimum time between live-region announcements. Default 3000. */
  announceIntervalMs?: number;
  /**
   * Peek: blend a little of the future state into what a control affects.
   * `amount` (default 0.15) sets `--en-peek-amount`; `maxAmount` caps it
   * (never above 0.35). `tokens` are registered at start, like `definePeekTokens`.
   * `maxGlobalNodes` (default 4000): a global token peek restyles the whole
   * document, so above this many elements it is skipped (scoped peeks aren't).
   */
  peek?: { amount?: number; maxAmount?: number; maxGlobalNodes?: number; tokens?: readonly PeekTokenDefinition[] };
  /**
   * Habituation: effects a user keeps seeing quiet down, and recover after
   * `recoveryDays` without exposure. Counts are kept per key in
   * `localStorage` by default. `false` disables it. Default by profile:
   * enabled (site), disabled (app).
   */
  habituation?: false | HabituationOptions;
  /**
   * Reverse query: hold the modifier (default Alt/Option) and point at or
   * focus any element to see the controls that affect it. `depth: 2` also
   * shows writers of those writers. `false` disables it. Default by profile:
   * enabled (site), disabled (app: use `showSources`).
   */
  reverseQuery?: false | ReverseQueryOptions;
  /** Attention budget cap per preview/confirm. Default 8. */
  maxConcurrentTargets?: number;
  /** Fall back to the motionless outline preset under `prefers-reduced-motion`. Default true. */
  respectReducedMotion?: boolean;
  /**
   * Let touch pointers preview: the pointer sensor stops ignoring them and
   * compiled hover rules are no longer gated on `(hover: hover)`. Default false.
   */
  touchPreview?: boolean;
  /** Skip `styles` (presets). `registerEffect` still works. Default false. */
  unstyled?: boolean;
  /** Stylesheets to inject, typically `presetStyles` from `@entangled-ui/presets`. */
  styles?: readonly StyleSheetSpec[];
  /** Watch the DOM for `data-en-*` changes. Default true. */
  observe?: boolean;
  /**
   * Input sources. Default: pointer, focus and activation in JS mode;
   * activation only in CSS mode (preview needs no listeners there).
   */
  sensors?: readonly Sensor[];
  /** Override the `mode: "auto"` thresholds. */
  autoModeLimits?: AutoModeLimits;
  /** Called for malformed keys in `data-en-*` attributes. Default: `console.warn`. */
  onInvalidKey?: (token: string, el: Element) => void;
}

/** Options for `confirm()`. */
export interface ConfirmOptions {
  /**
   * Afterglow length (ms). Default: `confirmMs` for `self`, `remoteConfirmMs` for `peer`/`system`.
   */
  durationMs?: number;
  /** 0-1 before budgeting. Default 1. */
  intensity?: number;
  /**
   * Also highlight other writers of the key ("newly available interactions").
   * Default: `EntangledOptions.includeWriters` (by profile: site true, app false).
   */
  includeWriters?: boolean;
  /**
   * The control that caused the change; never highlighted itself. When
   * omitted, the writer activated (click/change) within the last second is
   * used if it writes a matching key (not for `peer` changes). Pass `null` to disable.
   */
  source?: Element | null;
  /**
   * If nothing matches yet, keep trying for this long (ms). Covers state
   * updates a framework commits after the next frame, e.g. React updates made
   * outside an event handler. Default 250.
   */
  waitMs?: number;
  /**
   * Who caused the change. Default: inferred (`self` right after trusted user input, else
   * `system`).
   */
  origin?: Origin;
  /** The collaborator behind a `peer` change: badge text and color. */
  actor?: Actor;
  /** Live-region text for this change (with `announceRemoteChanges`); `false` stays silent. */
  announce?: string | false;
  /** Override the resolved notify level for this confirm. */
  notify?: NotifyLevel;
  /** A destructive change: never habituates. */
  severity?: Severity;
}

/** The runtime returned by `createEntangled`. */
export interface EntangledRuntime {
  /** The writer/reader graph, kept in sync with `data-en-*` attributes. */
  readonly graph: Graph<Element>;
  /** Resolved mode (decided at `start()`; `"js"` before that). */
  readonly mode: Mode;
  /** Whether `start()` has run and `destroy()` hasn't since. */
  readonly started: boolean;
  /** The resolved profile. */
  readonly profile: Profile;
  /** Current attention level. */
  readonly level: AttentionLevel;
  /**
   * Switch level now (persisted unless `attention.persist === false`). Works before and after
   * `start()`.
   */
  setLevel(level: AttentionLevel): void;
  /** Attach listeners, inject styles, scan the DOM. No-op without a DOM. */
  start(): void;
  /**
   * Detach everything and remove what the runtime wrote to the DOM.
   * Habituation counts are saved first. `start()` can be called again.
   */
  destroy(): void;
  /**
   * Show an afterglow on what changed: the readers of each key and, by
   * default, its other writers. Changes carry a kind, a label (the value
   * afterglow chip) and a certainty. Applied on the next frame; ignored
   * before `start()`. Throws `InvalidKeyError` for a malformed key.
   */
  confirm(changes: ChangeInput, options?: ConfirmOptions): void;
  /**
   * Treat confirms in the next `originWindowMs` as caused by the user, for
   * input the trusted-event listeners can't see (voice commands, gamepads...).
   */
  markUserIntent(): void;
  /**
   * Token Peek (Tier 1): while a writer whose `data-en-next` names a state is
   * previewed, blend these tokens a little toward that state. Pure CSS on
   * hover. Layout-affecting tokens are rejected (warned, and listed by
   * `peekRejections`). Returns a function that unregisters the set.
   */
  definePeekTokens(def: PeekTokenDefinition): () => void;
  /** Tokens rejected by `definePeekTokens`, with the reason. */
  readonly peekRejections: readonly PeekRejection[];
  /**
   * Value Peek (Tier 2): a writer's current and candidate next value, read
   * when its preview starts (after the dwell). Returns an unregister function.
   */
  peekWriter(el: Element, peek: ValuePeekWriter): () => void;
  /**
   * Value Peek: how a reader formats the change it would see. The text is
   * written to `data-en-delta` while a writer of its key is previewed (the
   * presets draw it as a chip on `::after`); `null` shows nothing. Returns an
   * unregister function. Superseded by `formatReader` and `Change.label`.
   */
  peekReader(el: Element, delta: (current: unknown, next: unknown) => string | null): () => void;
  /**
   * How a reader words the change it would see (`preview`) or saw (`confirm`),
   * as its chip. Wins over `Change.label` and `peekReader`; `null` falls back
   * to them. Returns an unregister function.
   */
  formatReader(el: Element, format: (change: Change, phase: FormatPhase) => string | null): () => void;
  /**
   * Called with a writer's would-be value when a preview of `key` starts
   * (after the dwell), and with `undefined` when it ends.
   */
  onPeek(key: Key, listener: (next: unknown) => void): () => void;
  /**
   * Programmatic preview of keys or changes; returns a function that ends it.
   * `peek` gives its readers a Value Peek (their `peekReader` deltas), as a
   * writer's would. Throws `InvalidKeyError` for a malformed key.
   */
  preview(changes: ChangeInput, options?: PreviewOptions): () => void;
  /**
   * A writer whose effect is worked out when it is looked at: an undo
   * button, a delete, an insert at the playhead. `plan` runs as its preview
   * starts (after the dwell, never on pointerover) and returns the changes it
   * would make then; `null` previews nothing. The element still carries
   * `data-en-affects` (a key that names it) so input finds it, and usually
   * `data-en-confirm="manual"`. Returns an
   * unregister function.
   */
  foresee(el: Element, plan: ForesightPlan, options?: ForeseeOptions): () => void;
  /** The writers that affect `el` (reverse lookup, up to `reverseQuery.depth`). */
  sourcesOf(el: Element): Element[];
  /**
   * Show the writers that affect `el`, as a reverse query would, until the returned function is
   * called.
   */
  showSources(el: Element): () => void;
  /** Whether a reverse query is active (the modifier is held). */
  readonly querying: boolean;
  /**
   * Runtime events for tooling: confirms, attention-budget overflows, graph
   * changes, queries, levels, foresight plans and deviations.
   */
  onEvent(listener: (event: RuntimeEvent) => void): () => void;
  /**
   * Habituation counters: `reset("export")`, `reset()` for everything, `inspect()` to list them.
   */
  readonly habituation: {
    /** False when `habituation: false` was passed. */
    readonly enabled: boolean;
    /** Forget the counts for `key`, or for every key when omitted. */
    reset(key?: Key): void;
    /** The stored counts, one record per key. Empty when disabled. */
    inspect(): HabituationRecord[];
  };
  /**
   * Add or replace an effect preset (`[data-en-fx="<name>"]`), wrapped in
   * `@layer entangled.effects`.
   */
  registerEffect(name: string, css: string): void;
  /**
   * What the runtime last applied to `el`. JS-driven state only: CSS-mode
   * hover previews don't show up here.
   */
  getState(el: Element): SalienceState;
}

/** A Value Peek given as values: what a change would turn `current` into. */
export interface ValuePeek {
  readonly current: unknown;
  readonly next: unknown;
}

/** Options for `preview()`. */
export interface PreviewOptions {
  /** Value Peek for the previewed readers' deltas. */
  peek?: ValuePeek;
  /** Caution tone; also what `minimal` lets through. */
  severity?: Severity;
  /** The control this preview is for: used for regions (far channel). */
  source?: Element | null;
}

/** A foresight result given as keys, with a Value Peek for its readers (see `foresee`). */
export interface WriterResolution {
  /** The keys it affects now. */
  readonly keys: readonly Key[];
  /** Value Peek for its readers' deltas. */
  readonly peek?: ValuePeek;
}

/** Value Peek source for a writer (see `peekWriter`). */
export interface ValuePeekWriter {
  /** The value as it is now. */
  current(): unknown;
  /** The value the writer would set if activated. */
  next(): unknown;
}

interface Resolution {
  changes: ChangeSet;
  peek?: ValuePeek;
}

interface Resolver {
  plan: ForesightPlan;
  options: ForeseeOptions;
  last?: { revision: unknown; result: Resolution | null };
}

/** A foresight result as changes (and a Value Peek); `null` when it previews nothing. */
function normalize(result: ForesightResult): Resolution | null {
  if (result === null || result === undefined) return null;
  const withKeys = typeof result === "object" && !Array.isArray(result) && Array.isArray((result as WriterResolution).keys);
  const res = withKeys
    ? { changes: toChanges((result as WriterResolution).keys), peek: (result as WriterResolution).peek }
    : { changes: toChanges(result as ChangeInput) };
  return res.changes.length ? res : null;
}

/** Foreseen changes stay comparable this long after they were shown. */
const FORESEEN_MS = 5000;

interface PreviewSource {
  writer: Element | null;
  /** Resolved (foresight/programmatic) changes. Static writers use `writerChanges()` instead. */
  changes: ChangeSet;
  /** A dynamic writer's preview: `changes` stands, not the writer's own. */
  resolved?: boolean;
  /** Value Peek given as values (a programmatic preview's, or a dynamic writer's). */
  peek?: ValuePeek;
  /** Caution tone, and what `minimal` lets through. */
  destructive: boolean;
  /** `PreviewOptions.source`, for regions. */
  from?: Element | null;
  holders: Set<string>;
  /** When the preview started (habituation counts it once fully shown). */
  since: number;
}

interface ConfirmEntry {
  key: Key;
  change: Change;
  intensity: number;
  /** When this afterglow started: the coalescing window counts from here. */
  start: number;
  until: number;
  durationMs: number | undefined;
  origin: Origin;
  actor: Actor | undefined;
  notify: NotifyLevel;
  /** In another region than the control that caused it. */
  far: boolean;
}

interface PendingConfirm {
  changes: ChangeSet;
  options: ConfirmOptions;
  origin: Origin;
  source: Element | null;
  /** Until when an empty match is retried instead of dropped. */
  deadline: number;
}

/**
 * What the runtime wrote to an element. Sources and chips are tracked separately (`sourced`,
 * `deltas`).
 */
interface Applied extends Omit<SalienceState, "source" | "kind" | "label"> {
  preview: boolean;
  durationMs: number | undefined;
  actor: Actor | undefined;
  /** Written as `data-en-notify` while confirming: `quiet` and `interrupt` only. */
  notify: NotifyLevel | null;
  /** Far from its cause: the sticky `data-en-far`. */
  far: boolean;
  /** The change drawn (kind and certainty are sticky attributes). */
  change: Change;
  /** Caution tone (previews of destructive changes). */
  tone: boolean;
}

/** Form attributes that outlive `clear()`: their CSS fades with the effect (see `write`). */
const STICKY = [ATTR.kind, ATTR.certainty, ATTR.tone, ATTR.far] as const;
const STICKY_SELECTOR = STICKY.map((a) => `[${a}]`).join(",");

const IDLE: SalienceState = Object.freeze({
  state: "idle",
  intensity: 0,
  key: null,
  origin: null,
  source: false,
  kind: null,
  label: null,
}) as SalienceState;
/** Above this many candidates, registration order stands in for document order. */
const DOC_ORDER_LIMIT = 4096;
const DEFAULT_CONFIRM_MS = 900;
const DEFAULT_PREVIEW_MS = 180;
const IMPLICIT_SOURCE_MS = 1000;
const DEFAULT_CONFIRM_WAIT_MS = 250;
const REMOTE_DURATION_SCALE = 1.8;

const hasDom = () => typeof document !== "undefined" && typeof window !== "undefined";
const passive: AddEventListenerOptions = { passive: true };

/**
 * Run `fn` when the browser is idle (or soon, without `requestIdleCallback`). Returns a canceller.
 */
function idle(fn: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(fn, { timeout: 1000 });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(fn, 200);
  return () => clearTimeout(id);
}
const keysOf = (changes: ChangeSet): Key[] => changes.map((c) => c.key);
const round3 = (n: number) => Math.round(n * 1000) / 1000;

function parseDurationMs(value: string): number | null {
  const m = /^\s*([\d.]+)\s*(ms|s)\s*$/.exec(value);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] === "s" ? n * 1000 : n;
}

function supportsHas(): boolean {
  try {
    return typeof CSS !== "undefined" && CSS.supports("selector(:has(a))");
  } catch {
    return false;
  }
}

function docOrder(a: Element, b: Element): number {
  return a.compareDocumentPosition(b) & 4 /* FOLLOWING */ ? -1 : 1;
}

/** Set, replace or remove an attribute, touching the DOM only when it differs. */
function setAttr(el: Element, name: string, value: string | null) {
  if (value === null) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
  } else if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

/** Create a runtime. Nothing touches the DOM until `start()`. */
export function createEntangled(options: EntangledOptions = {}): EntangledRuntime {
  const profile = options.profile ?? "site";
  const defaults = PROFILE_DEFAULTS[profile];
  const includeWritersDefault = options.includeWriters ?? defaults.includeWriters;
  const autoConfirm = defaults.autoConfirm;
  const dwellMs = options.dwellMs ?? 120;
  const maxTargets = options.maxConcurrentTargets ?? 8;
  /** Mutable: `guided` halves the dwell, and the pointer sensor reads it per hover. */
  const sensorOptions = { dwellMs, touchPreview: options.touchPreview ?? false };
  const coalesceMs = options.coalesceMs ?? 2000;
  const onInvalidKey =
    options.onInvalidKey ?? ((token: string) => console.warn(`[entangled] ignoring invalid key "${token}"`));

  const graph = createGraph<Element>();
  let mode: Mode = "js";

  let started = false;
  let root: Document | ShadowRoot | null = null;
  let doc: Document | null = null;
  let binding: DomBinding | null = null;
  let styles: StyleHost | null = null;
  let overlay: HTMLElement | null = null;
  let confirmMs = options.confirmMs ?? DEFAULT_CONFIRM_MS;
  let remoteConfirmMs = 0;
  let intent: IntentTracker | null = null;
  let announcer: Announcer | null = null;
  const customEffects = new Map<string, string>();
  const detach: Array<() => void> = [];
  /** Input sensors and the reverse-query modifier listeners: detached while the level is `off`. */
  const sensorDetach: Array<() => void> = [];
  const queryDetach: Array<() => void> = [];

  // Attention.
  let level: AttentionLevel = options.attention?.level ?? "standard";
  /** `setLevel()` before `start()` wins over storage. */
  let levelFromApi = false;
  const persist = options.attention?.persist ?? true;
  const storageKey = (typeof persist === "object" && persist.storageKey) || "entangled:attention";
  const notifyFor = createNotifyResolver(options.attention?.notify);
  /** The notify level a confirm gets at the current attention level. */
  const effectiveNotify = (raw: NotifyLevel, origin: Origin): NotifyLevel =>
    level === "minimal" && origin === "self" && raw !== "interrupt"
      ? "ignore"
      : level === "guided" && raw === "quiet"
        ? "aware"
        : raw;
  let warnedLevel = false;

  const sources = new Map<object, PreviewSource>();
  // Budgeted preview targets per source, valid until the graph changes. The
  // exact document-order sort is the most expensive step on the hover path.
  let previewCache = new Map<
    object,
    {
      active: Array<{ target: Element; intensity: number; change: Change }>;
      global: Change | null;
      candidates: number;
      /** A static writer's own changes (`data-en-change`), parsed once per cache entry. */
      changes?: ChangeSet;
    }
  >();
  const confirms = new Map<Element, ConfirmEntry>();
  /** Lit elements whose afterglow must replay: they go idle for one frame first. */
  const restarting = new Set<Element>();
  /** Last afterglow start per element and `origin key`, for absorbing remote bursts. */
  let lastGlow = new WeakMap<Element, Map<string, number>>();
  /**
   * Viewport visibility of remote-confirm candidates (IntersectionObserver, never a layout read).
   */
  const visible = new Map<Element, boolean>();
  let visibility: IntersectionObserver | null = null;
  let pendingConfirms: PendingConfirm[] = [];
  let applied = new Map<Element, Applied>();
  const styleAttrOwned = new WeakSet<Element>();

  let lastActivation: { writer: Element; at: number } | null = null;

  // Peek.
  const peekAmount = options.peek?.amount;
  let tokenPeek: TokenPeek | null = null;
  const peekDefs: Array<{ def: PeekTokenDefinition; dispose: (() => void) | null }> = (options.peek?.tokens ?? []).map(
    (def) => ({ def, dispose: null }),
  );
  const peekWriters = new Map<Element, ValuePeekWriter>();
  const resolvers = new Map<Element, Resolver>();
  // Plan vs actual.
  const lastShown = new Map<Element, { changes: ChangeSet; at: number }>();
  let armed: { writer: Element; foreseen: ChangeSet; actual: Change[]; timer: ReturnType<typeof setTimeout> } | null = null;
  const deviationWindowMs = options.foresight?.deviationWindowMs ?? 1000;
  const formatters = new Map<Element, (change: Change, phase: FormatPhase) => string | null>();
  /** A static writer's changes: its keys, with the kinds `data-en-change` gives them. */
  const writerChanges = (writer: Element): ChangeSet => {
    const entry = previewCache.get(writer);
    if (entry?.changes) return entry.changes;
    const changes = parseChangeAttr(writer.getAttribute(ATTR.change), graph.keysOf(writer, "writer"), (t) => onInvalidKey(t, writer));
    if (entry) entry.changes = changes;
    return changes;
  };
  /** The changes a source previews: its writer's, unless it carries its own. */
  const sourceChanges = (src: PreviewSource) => (src.writer && !src.resolved ? writerChanges(src.writer) : src.changes);
  const sourceKeys = (src: PreviewSource) => keysOf(sourceChanges(src));
  /**
   * CSS mode draws a static writer's preview itself, unless it has a form (kind, tone) only JS can
   * add.
   */
  const drawsForm = (src: PreviewSource) => src.destructive || sourceChanges(src).some((c) => c.kind !== undefined && c.kind !== "modify");
  const peekReaders = new Map<Element, (current: unknown, next: unknown) => string | null>();
  const peekListeners = new Map<Key, Set<(next: unknown) => void>>();
  /** Last value each `onPeek` key was notified with. */
  const peekNotified = new Map<Key, unknown>();
  let deltas = new Map<Element, string>();
  /**
   * Pointer/focus sensors attached (always in JS mode; in CSS mode only once Value Peek or forms
   * need them).
   */
  let hoverSensors = false;
  /** Some writer carries `data-en-change` or `data-en-severity`. */
  let formWriters = false;

  // Habituation.
  const hab: Habituation | null =
    options.habituation === false || (options.habituation === undefined && !defaults.habituation)
      ? null
      : createHabituation(options.habituation ?? {});
  /** Multipliers per `kind key`, valid until the next exposure or reset. */
  let multipliers = new Map<string, number>();
  let exposures: Array<{ key: Key; kind: "preview" | "peek" | "confirm" }> = [];
  let exposureTask: (() => void) | null = null;
  /** Per-key multiplier variables on the root, consumed by CSS-driven effects. */
  const habVars = new Map<string, string>();
  let previewMs = DEFAULT_PREVIEW_MS;

  const multiplier = (key: Key, kind: "preview" | "peek" | "confirm") => {
    // `guided` shows everything at full strength; exposures are still counted.
    if (!hab || level === "guided") return 1;
    const slot = `${kind} ${key}`;
    let m = multipliers.get(slot);
    if (m === undefined) multipliers.set(slot, (m = hab.multiplier(key, kind, kind === "confirm" ? "self" : undefined)));
    return m;
  };

  // Reverse query.
  const query =
    options.reverseQuery === false
      ? null
      : options.reverseQuery !== undefined
        ? { modifier: "Alt", depth: 1, ...options.reverseQuery }
        : defaults.reverseQuery === false
          ? null
          : { modifier: "Alt", depth: 1, ...defaults.reverseQuery };
  let querying = false;
  /** `showSources` pins: shown as sources until disposed, whether or not a query is held. */
  const pinned = new Map<object, Element>();
  /** JS mode: what the pointer and keyboard focus are on while querying. */
  const queryTargets: Record<"pointer" | "focus", Element | null> = { pointer: null, focus: null };
  let sourced = new Set<Element>();
  let reverseCss: string | null = null;
  let detachQueryInput: (() => void) | null = null;

  // Tooling events.
  const eventListeners = new Set<(event: RuntimeEvent) => void>();
  const emit = (make: () => RuntimeEvent) => {
    if (eventListeners.size === 0) return;
    const event = make();
    for (const l of [...eventListeners]) l(event);
  };
  /** Sources whose preview start was reported (one budget event per hover). */
  const reported = new WeakSet<PreviewSource>();

  // CSS-compiled mode state.
  let compiledCss = "";
  let overflow = new Map<Element, string>();

  let frame = 0;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;

  const schedule = () => {
    if (!started || frame) return;
    frame = requestAnimationFrame(flush);
  };

  const routesToOverlay = (el: Element) => overlayRouted(el, graph.optionsOf(el, "reader")?.effect);

  /**
   * Each element's region (`data-en-region` on it or an ancestor); regions are static, re-read when
   * the graph changes.
   */
  let regions = new WeakMap<Element, string | null>();
  const regionOf = (el: Element): string | null => {
    let r = regions.get(el);
    if (r === undefined) regions.set(el, (r = el.closest(`[${ATTR.region}]`)?.getAttribute(ATTR.region) ?? null));
    return r;
  };
  /** Far: both ends are in regions, and not the same one. */
  const isFar = (from: string | null, el: Element) => {
    if (from === null) return false;
    const to = regionOf(el);
    return to !== null && to !== from;
  };

  const priorityOf = (el: Element) =>
    graph.optionsOf(el, "reader")?.priority ?? graph.optionsOf(el, "writer")?.priority ?? 0;

  /**
   * Resolve changes to element targets plus whether the global overlay is
   * involved. An element reached by several changes keeps the one with the
   * strictly higher `changeRank` (equal rank: the first).
   */
  function collect(changes: ChangeSet, includeWriters: boolean, exclude: Element | null) {
    const targets = new Map<Element, Change>();
    let global: Change | null = null;
    const wins = (prev: Change | null | undefined, next: Change) => !prev || changeRank(next.kind) > changeRank(prev.kind);
    const add = (set: ReadonlySet<Element>, change: Change) => {
      for (const el of set) {
        if (el === exclude) continue;
        if (routesToOverlay(el)) {
          if (wins(global, change)) global = change;
        } else if (wins(targets.get(el), change)) targets.set(el, change);
      }
    };
    for (const change of changes) {
      const key = change.key;
      if (parseKey(key).global) {
        if (wins(global, change)) global = change;
        continue;
      }
      add(graph.readersOf(key), change);
      if (includeWriters) {
        // A writer of `*` matches every key, but that doesn't make it a
        // "newly available interaction" for each one: count only writers
        // that match through a non-global key.
        const writers = new Set<Element>();
        for (const w of graph.writersOf(key)) {
          if (graph.keysOf(w, "writer").some((k) => k !== GLOBAL_KEY && keyMatches(k, key))) writers.add(w);
        }
        add(writers, change);
      }
    }
    return { targets, global };
  }

  /**
   * Attention budget: the top `maxTargets` by priority, then document order.
   * Same policy as `allocateBudget`, but selects with O(n log k) comparisons
   * instead of sorting every candidate. Remote confirms rank elements known
   * to be in the viewport ahead of those known to be outside it.
   */
  function budget(targets: Map<Element, unknown>, intensity: number, byVisibility = false) {
    const n = targets.size;
    let chosen: Element[];
    if (n <= maxTargets) chosen = [...targets.keys()];
    else {
      const exact = n <= DOC_ORDER_LIMIT;
      const order = new Map<Element, number>();
      if (!exact) {
        let i = 0;
        for (const el of targets.keys()) order.set(el, i++);
      }
      const prio = new Map<Element, number>();
      for (const el of targets.keys()) prio.set(el, priorityOf(el));
      chosen = selectTop(
        targets.keys(),
        maxTargets,
        (a, b) =>
          prio.get(b)! - prio.get(a)! ||
          (byVisibility ? inView(b) - inView(a) : 0) ||
          (exact ? docOrder(a, b) : order.get(a)! - order.get(b)!),
      );
    }
    const each = budgetIntensity(chosen.length, { intensity });
    return chosen.map((target) => ({ target, intensity: each }));
  }

  /** 1 when an element is (or may be) in the viewport, 0 when known to be outside it. */
  const inView = (el: Element) => (visible.get(el) === false ? 0 : 1);

  function watchVisibility(el: Element) {
    if (!visibility || visible.has(el)) return;
    visible.set(el, true); // unknown until the first callback: assume visible
    visibility.observe(el);
  }

  /**
   * Start, merge or absorb one element's afterglow.
   * - Lit by the same origin within `coalesceMs` of its start: merge (extend,
   *   keep the stronger intensity, don't replay).
   * - Lit otherwise (window over, or a different origin): replay as a new afterglow.
   * - Faded, remote, and the same origin+key glowed within the window: absorbed.
   */
  function glow(
    el: Element,
    change: Change,
    intensity: number,
    now: number,
    c: Omit<ConfirmEntry, "key" | "change" | "intensity" | "start" | "until"> & { duration: number },
  ): boolean {
    const key = change.key;
    const prev = confirms.get(el);
    const lit = prev !== undefined && prev.until > now;
    if (lit && prev.origin === c.origin && now < prev.start + coalesceMs) {
      prev.until = Math.max(prev.until, now + c.duration);
      prev.intensity = Math.max(prev.intensity, intensity);
      if (c.actor) prev.actor = c.actor;
      prev.notify = c.notify;
      prev.far = c.far;
      prev.change = change; // the newest label wins
      prev.key = key;
      return false;
    }
    const slot = `${c.origin} ${key}`;
    let glows = lastGlow.get(el);
    if (!lit && isRemote(c.origin) && now - (glows?.get(slot) ?? -Infinity) < coalesceMs) return false;
    if (lit) restarting.add(el);
    confirms.set(el, {
      key,
      change,
      intensity,
      start: now,
      until: now + c.duration,
      durationMs: c.durationMs,
      origin: c.origin,
      actor: c.actor,
      notify: c.notify,
      far: c.far,
    });
    if (!glows) lastGlow.set(el, (glows = new Map()));
    glows.set(slot, now);
    return true;
  }

  /**
   * Overlapping remote bursts share one attention budget: keep the most
   * recent afterglows, then those in the viewport, then document order.
   */
  function capRemote(now: number) {
    const lit = [...confirms].filter(([el, c]) => el !== overlay && isRemote(c.origin) && c.until > now);
    if (lit.length <= maxTargets) return;
    lit.sort(([a, ca], [b, cb]) => cb.start - ca.start || inView(b) - inView(a) || docOrder(a, b));
    for (const [el] of lit.slice(maxTargets)) confirms.delete(el);
  }

  function processPendingConfirms(now: number) {
    if (pendingConfirms.length === 0) return;
    // Register nodes inserted by the action that caused this confirm.
    binding?.flush();
    const queue = pendingConfirms;
    pendingConfirms = [];
    let anyRemote = false;
    for (const item of queue) {
      const { changes, options: o, origin } = item;
      const { targets, global } = collect(changes, o.includeWriters ?? includeWritersDefault, item.source);
      if (targets.size === 0 && !global && now < item.deadline) {
        pendingConfirms.push(item); // its elements may not be in the DOM yet: retry next frame
        continue;
      }
      const remote = isRemote(origin);
      anyRemote ||= remote;
      if (remote) for (const el of targets.keys()) watchVisibility(el);
      const destructive = o.severity === "destructive";
      const fromRegion = item.source ? regionOf(item.source) : null;
      const exposed = new Set<Key>();
      const light = (el: Element, change: Change, intensity: number) => {
        const key = change.key;
        const notify = effectiveNotify(o.notify ?? notifyFor(key, origin), origin);
        if (notify === "ignore") return;
        // Your own confirms habituate; remote ones are news, and interruptions and destructive
        // changes must be seen.
        const habituates = !remote && !destructive && notify !== "interrupt";
        const m = habituates ? multiplier(key, "confirm") : 1;
        const base = notify === "interrupt" ? 1 : notify === "quiet" ? intensity * 0.5 : intensity;
        // Longer durations are written inline; the rest follow the token unless overridden.
        const durationMs =
          o.durationMs ?? (notify === "interrupt" || (remote && notify === "aware") ? remoteConfirmMs : undefined);
        const far = el !== overlay && isFar(fromRegion, el);
        const entry = { duration: durationMs ?? confirmMs, durationMs, origin, actor: o.actor, notify, far };
        if (glow(el, change, round3(base * m), now, entry) && habituates) exposed.add(key);
      };
      for (const a of budget(targets, o.intensity ?? 1, remote)) light(a.target, targets.get(a.target)!, a.intensity);
      if (global && overlay) light(overlay, global, Math.min(1, Math.max(0, o.intensity ?? 1)));
      for (const key of exposed) expose(key, "confirm");
      const keys = keysOf(changes);
      emit(() => ({
        type: "confirm",
        time: now,
        keys,
        changes,
        origin,
        actor: o.actor,
        shown: Math.min(targets.size, maxTargets) + (global ? 1 : 0),
      }));
      if (targets.size > maxTargets) {
        emit(() => ({ type: "budget", time: now, key: keys.join(" "), kind: "confirm", candidates: targets.size, shown: maxTargets }));
      }
    }
    if (anyRemote) capRemote(now);
  }

  /** Count an exposure; processed when the browser is idle, off the hover path. */
  function expose(key: Key, kind: "preview" | "peek" | "confirm") {
    if (!hab || !started) return;
    exposures.push({ key, kind });
    exposureTask ??= idle(processExposures);
  }

  function processExposures() {
    exposureTask = null;
    if (!hab) return;
    const batch = exposures;
    exposures = [];
    const touched = new Set<Key>();
    for (const { key, kind } of batch) {
      hab.expose(key, kind, kind === "confirm" ? "self" : undefined);
      touched.add(key);
    }
    multipliers = new Map();
    syncHabVars(touched);
  }

  /** A previewed writer was fully shown: count it (and its token peeks). */
  function exposeWriter(writer: Element) {
    if (level === "off") return;
    const keys = graph.keysOf(writer, "writer");
    const peeks = writer.hasAttribute(ATTR.next) ? new Set(tokenPeek?.sets().map((s) => s.key)) : null;
    for (const key of keys) {
      expose(key, "preview");
      if (peeks?.has(key)) expose(key, "peek");
    }
  }

  /**
   * CSS-driven effects (compiled preview rules, token peek) read the
   * multipliers from root variables. Written only when a multiplier changes,
   * never on hover; at 1 the variable is removed.
   */
  function syncHabVars(keys: Iterable<Key>) {
    if (!hab || !doc) return;
    const style = doc.documentElement.style;
    const peekKeys = new Set(tokenPeek?.sets().map((s) => s.key));
    for (const key of keys) {
      const vars: Array<[string, number]> = [[habituationVar(key, "preview"), multiplier(key, "preview")]];
      if (peekKeys.has(key)) vars.push([habituationVar(key, "peek"), multiplier(key, "peek")]);
      for (const [name, m] of vars) {
        const value = m < 1 ? String(m) : null;
        if ((habVars.get(name) ?? null) === value) continue;
        if (value === null) {
          habVars.delete(name);
          style.removeProperty(name);
        } else {
          habVars.set(name, value);
          style.setProperty(name, value);
        }
      }
    }
  }

  function clearHabVars() {
    const style = doc?.documentElement.style;
    for (const name of habVars.keys()) style?.removeProperty(name);
    habVars.clear();
  }

  /**
   * CSS mode has no hover listeners, so habituation counts exposures from a
   * passive delegated listener whose events are only queued; working out
   * which writer was hovered, and for how long, happens when idle.
   */
  function attachExposureListener(r: Document | ShadowRoot) {
    const events: Array<{ type: string; target: EventTarget | null; related: EventTarget | null; t: number }> = [];
    let task: (() => void) | null = null;
    const hovering: Record<"pointer" | "focus", { writer: Element; since: number } | null> = { pointer: null, focus: null };
    const shownAfter = () => dwellMs + previewMs;
    const process = () => {
      task = null;
      for (const e of events.splice(0)) {
        const channel = e.type.startsWith("pointer") ? "pointer" : "focus";
        const cur = hovering[channel];
        if (e.type === "pointerover" || e.type === "focusin") {
          const w = findWriter(e.target);
          if (w === cur?.writer) continue;
          if (cur && e.t - cur.since >= shownAfter()) exposeWriter(cur.writer);
          hovering[channel] = w ? { writer: w, since: e.t } : null;
        } else if (cur && findWriter(e.related) !== cur.writer) {
          if (e.t - cur.since >= shownAfter()) exposeWriter(cur.writer);
          hovering[channel] = null;
        }
      }
      // Already idle: count them now rather than waiting for another idle period.
      if (exposures.length) {
        exposureTask?.();
        processExposures();
      }
    };
    const onEvent = (e: Event) => {
      if ((e as PointerEvent).pointerType === "touch") return;
      events.push({ type: e.type, target: e.target, related: (e as MouseEvent | FocusEvent).relatedTarget, t: e.timeStamp });
      task ??= idle(process);
    };
    const types = ["pointerover", "pointerout", "focusin", "focusout"];
    for (const t of types) r.addEventListener(t, onEvent, passive);
    detach.push(() => {
      task?.();
      for (const t of types) r.removeEventListener(t, onEvent, passive);
    });
  }

  function write(el: Element, next: Applied, prev: Applied | undefined) {
    const style = (el as HTMLElement).style;
    if (!style) return;
    if (!prev && !el.hasAttribute("style")) styleAttrOwned.add(el);
    if (prev?.state !== next.state && next.state !== "idle") el.setAttribute(ATTR.state, next.state);
    if (prev?.intensity !== next.intensity) style.setProperty(VARS.intensity, String(next.intensity));
    if (prev?.preview !== next.preview) {
      if (next.preview) style.setProperty(VARS.preview, "1");
      else style.removeProperty(VARS.preview);
    }
    if (prev?.durationMs !== next.durationMs) {
      if (next.durationMs === undefined) style.removeProperty(VARS.durationConfirm);
      else style.setProperty(VARS.durationConfirm, `${next.durationMs}ms`);
    }
    if (prev?.origin !== next.origin) {
      if (next.origin) el.setAttribute(ATTR.origin, next.origin);
      else el.removeAttribute(ATTR.origin);
    }
    if (prev?.actor !== next.actor) {
      const label = next.actor ? (next.actor.name ?? next.actor.id) : "";
      if (label) el.setAttribute(ATTR.actor, label);
      else el.removeAttribute(ATTR.actor);
      if (next.actor?.color) style.setProperty(VARS.actorColor, next.actor.color);
      else style.removeProperty(VARS.actorColor);
    }
    setAttr(el, ATTR.notify, next.state === "confirm" ? next.notify : null);
    // Sticky: their CSS fades with the effect, so clear() leaves them for the next salience to
    // replace.
    const kind = next.change.kind;
    setAttr(el, ATTR.kind, kind && kind !== "modify" ? kind : null);
    setAttr(el, ATTR.certainty, next.change.certainty === "may" ? "may" : null);
    setAttr(el, ATTR.tone, next.tone ? "caution" : null);
    setAttr(el, ATTR.far, next.far ? "" : null);
  }

  /** Remove the sticky form attributes everywhere (an attribute query, no layout). */
  function clearSticky() {
    root?.querySelectorAll(STICKY_SELECTOR).forEach((el) => {
      for (const name of STICKY) el.removeAttribute(name);
    });
  }

  function clear(el: Element) {
    el.removeAttribute(ATTR.state);
    el.removeAttribute(ATTR.origin);
    el.removeAttribute(ATTR.actor);
    el.removeAttribute(ATTR.notify);
    const style = (el as HTMLElement).style;
    if (!style) return;
    style.removeProperty(VARS.preview);
    style.removeProperty(VARS.intensity);
    style.removeProperty(VARS.durationConfirm);
    style.removeProperty(VARS.actorColor);
    releaseStyle(el);
  }

  /** Drop the `style` attribute if the runtime created it and nothing is left in it. */
  function releaseStyle(el: Element) {
    const style = (el as HTMLElement).style;
    if (styleAttrOwned.has(el) && style?.length === 0) {
      el.removeAttribute("style");
      styleAttrOwned.delete(el);
    }
  }

  /**
   * Reverse query (JS mode): `--en-source: 1` on the writers that affect the inspected elements.
   */
  function applySources(next: Set<Element>) {
    for (const el of sourced) {
      if (next.has(el)) continue;
      (el as HTMLElement).style?.removeProperty(VARS.source);
      releaseStyle(el);
    }
    for (const el of next) {
      if (sourced.has(el)) continue;
      const style = (el as HTMLElement).style;
      if (!style) continue;
      if (!el.hasAttribute("style")) styleAttrOwned.add(el);
      style.setProperty(VARS.source, "1");
    }
    sourced = next;
  }

  function flush() {
    frame = 0;
    if (level === "off") return;
    const now = performance.now();
    processPendingConfirms(now);
    for (const [el, c] of confirms) if (c.until <= now || !el.isConnected) confirms.delete(el);

    const desired = new Map<Element, Applied>();
    const nextDeltas = new Map<Element, string>();
    const peeks: Array<{ keys: readonly Key[]; next: unknown }> = [];
    for (const [id, src] of sources) {
      if (level === "minimal" && !src.destructive) continue;
      let cached = previewCache.get(id);
      if (!cached) {
        const changes = sourceChanges(src);
        const { targets, global } = collect(changes, false, src.writer);
        cached = {
          active: budget(targets, 1).map((a) => ({ ...a, change: targets.get(a.target)! })),
          global,
          candidates: targets.size,
          changes: src.writer && !src.resolved ? changes : undefined,
        };
        previewCache.set(id, cached);
      }
      const { active, global } = cached;
      if (!reported.has(src)) {
        reported.add(src);
        const { candidates } = cached;
        if (candidates > maxTargets) {
          const key = sourceKeys(src).join(" ");
          emit(() => ({ type: "budget", time: now, key, kind: "preview", candidates, shown: active.length }));
        }
      }
      const writerPeek = src.writer ? peekWriters.get(src.writer) : undefined;
      const vp = src.peek ?? (writerPeek && { current: writerPeek.current(), next: writerPeek.next() });
      if (vp) peeks.push({ keys: sourceKeys(src), next: vp.next });
      // Chips: the reader's formatter, else the change's label, else its Value Peek delta.
      for (const { target, change } of active) {
        if (nextDeltas.has(target)) continue;
        const text =
          formatters.get(target)?.(change, "preview") ?? change.label ?? (vp ? peekReaders.get(target)?.(vp.current, vp.next) : null);
        if (text) nextDeltas.set(target, text);
      }
      // CSS mode previews a writer's own keys in CSS; JS only adds what CSS can't (Value Peek,
      // forms).
      if (mode === "css" && src.writer && !src.resolved && !drawsForm(src)) continue;
      const from = src.writer ?? src.from;
      const fromRegion = from ? regionOf(from) : null;
      for (const { target, intensity, change } of active) {
        if (!desired.has(target)) {
          const strength = round3(intensity * multiplier(change.key, "preview"));
          desired.set(target, previewing(strength, change, isFar(fromRegion, target), src.destructive));
        }
      }
      if (global && overlay && !desired.has(overlay)) {
        desired.set(overlay, previewing(multiplier(global.key, "preview"), global, false, src.destructive));
      }
    }
    notifyPeeks(peeks);
    const nextSources = new Set<Element>();
    for (const el of pinned.values()) for (const w of sourcesOf(graph, el, query?.depth ?? 1)) nextSources.add(w);
    if (mode === "js" && querying && query) {
      for (const el of Object.values(queryTargets)) if (el) for (const w of sourcesOf(graph, el, query.depth)) nextSources.add(w);
    }
    applySources(nextSources);
    for (const [el, c] of confirms) {
      const p = desired.get(el);
      desired.set(el, {
        state: "confirm",
        intensity: Math.max(c.intensity, p?.intensity ?? 0),
        key: c.key,
        origin: c.origin,
        actor: c.actor,
        preview: p?.preview ?? false,
        durationMs: c.durationMs,
        notify: c.notify === "quiet" || c.notify === "interrupt" ? c.notify : null,
        far: c.far,
        change: c.change,
        tone: false,
      });
      // Value afterglow: what changed, as a chip, while the confirm runs.
      if (el === overlay) continue;
      const text = formatters.get(el)?.(c.change, "confirm") ?? c.change.label ?? null;
      if (text) nextDeltas.set(el, text);
    }
    applyDeltas(nextDeltas);
    // Replaying an afterglow: leave the confirm state for one frame so the animation restarts.
    let replay = false;
    for (const el of restarting) {
      if (applied.get(el)?.state === "confirm") {
        desired.delete(el);
        replay = true;
      }
    }
    restarting.clear();

    for (const el of applied.keys()) if (!desired.has(el)) clear(el);
    for (const [el, next] of desired) {
      const prev = applied.get(el);
      if (
        !prev ||
        prev.state !== next.state ||
        prev.intensity !== next.intensity ||
        prev.preview !== next.preview ||
        prev.durationMs !== next.durationMs ||
        prev.origin !== next.origin ||
        prev.actor !== next.actor ||
        prev.notify !== next.notify ||
        prev.far !== next.far ||
        prev.change !== next.change ||
        prev.tone !== next.tone
      ) {
        write(el, next, prev);
      }
    }
    applied = desired;

    clearTimeout(expiryTimer);
    expiryTimer = undefined;
    let soonest = Infinity;
    for (const c of confirms.values()) soonest = Math.min(soonest, c.until);
    if (soonest !== Infinity) expiryTimer = setTimeout(schedule, Math.max(0, soonest - now) + 1);
    // Pending confirms retry next frame; a replay re-enters the confirm state next frame.
    if (pendingConfirms.length || replay) schedule();
  }

  function applyDeltas(next: Map<Element, string>) {
    for (const el of deltas.keys()) if (!next.has(el)) el.removeAttribute(ATTR.delta);
    for (const [el, text] of next) if (deltas.get(el) !== text) el.setAttribute(ATTR.delta, text);
    deltas = next;
  }

  function notifyPeeks(peeks: ReadonlyArray<{ keys: readonly Key[]; next: unknown }>) {
    for (const [key, listeners] of peekListeners) {
      const hit = peeks.find((p) => p.keys.some((k) => keyMatches(k, key)));
      const value = hit?.next;
      if (Object.is(peekNotified.get(key), value)) continue;
      peekNotified.set(key, value);
      for (const l of [...listeners]) l(value);
    }
  }

  /** Value Peek needs hover input; CSS mode attaches the sensors only once it's used. */
  function ensureHoverSensors() {
    if (hoverSensors || !started || options.sensors || level === "off") return;
    hoverSensors = true;
    attachSensors([pointerSensor(), focusSensor()]);
  }

  const previewing = (intensity: number, change: Change, far: boolean, tone: boolean): Applied => ({
    state: "preview",
    intensity,
    key: change.key,
    change,
    tone,
    origin: null,
    actor: undefined,
    preview: true,
    durationMs: undefined,
    notify: null,
    far,
  });

  const requestedMode = options.mode ?? defaults.mode;

  function resolveMode(r: Document | ShadowRoot): Mode {
    if (requestedMode === "js") return "js";
    const cssCapable = r instanceof Document && supportsHas();
    if (requestedMode === "css") return cssCapable ? "css" : "js";
    return chooseMode(
      { cssCapable, writerKeys: graph.snapshot().writerKeys.length, domNodes: r instanceof Document ? r.getElementsByTagName("*").length : 0 },
      options.autoModeLimits,
    );
  }

  /** `auto` only: leave CSS mode for good once the graph outgrows the criteria. */
  function maybeDowngrade() {
    if (requestedMode !== "auto" || mode !== "css" || !root) return;
    if (resolveMode(root) === "css") return;
    mode = "js";
    for (const el of overflow.keys()) el.removeAttribute(ATTR.over);
    overflow = new Map();
    compiledCss = "";
    styles?.remove("compiled");
    binding?.setNamespaces(false);
    ensureHoverSensors();
  }

  function attachSensors(sensors: readonly Sensor[]) {
    for (const sensor of sensors) sensorDetach.push(sensor.attach(sensorContext(sensor.name)));
  }

  /** A writer's change or severity attributes may have changed: drop what was parsed from them. */
  function onWriterAttr(el: Element) {
    if (previewCache.get(el)?.changes) previewCache.delete(el);
    if (!el.hasAttribute(ATTR.change) && !el.hasAttribute(ATTR.severity)) return;
    // Kinds and tone are drawn by JS: CSS mode needs hover input for them.
    formWriters = true;
    if (mode === "css") ensureHoverSensors();
  }

  /** The input sensors for the resolved mode (at `start()`, and when cues come back on). */
  function attachInputSensors() {
    // CSS mode: hover/focus preview is pure CSS, so only activation (confirm) listens.
    hoverSensors = !options.sensors && mode === "js";
    attachSensors(
      options.sensors ?? (mode === "css" ? [activationSensor()] : [pointerSensor(), focusSensor(), activationSensor()]),
    );
    const needsHover = peekReaders.size > 0 || peekListeners.size > 0 || resolvers.size > 0 || formatters.size > 0 || formWriters;
    if (mode === "css" && needsHover) ensureHoverSensors();
  }

  /**
   * CSS mode: recompile on graph changes (already batched per microtask).
   * The attention budget is settled here, never on the hover path: readers
   * beyond the cap for a key are marked `data-en-over~="<key>"`.
   */
  function compile() {
    if (!styles || !binding) return;
    if (level === "minimal" || level === "off") {
      // No hover previews at these levels: the compiled rules are what draws them in CSS mode.
      styles.remove("compiled");
      compiledCss = "";
      return;
    }
    const { writerKeys, readerKeys } = graph.snapshot();
    const intensities: Record<Key, number> = {};
    const nextOver = new Map<Element, Set<Key>>();
    const selfKeys: Key[] = [];
    for (const key of writerKeys) {
      if (parseKey(key).global) continue;
      const { targets } = collect([{ key }], false, null);
      for (const w of graph.writersOf(key)) {
        if (targets.has(w)) {
          selfKeys.push(key);
          break;
        }
      }
      if (targets.size <= maxTargets) {
        intensities[key] = budgetIntensity(targets.size);
        continue;
      }
      const active = budget(targets, 1);
      const keep = new Set(active.map((a) => a.target));
      intensities[key] = active[0]?.intensity ?? 1;
      emit(() => ({ type: "budget", time: performance.now(), key, kind: "preview", candidates: targets.size, shown: active.length }));
      for (const el of targets.keys()) {
        if (keep.has(el)) continue;
        let set = nextOver.get(el);
        if (!set) nextOver.set(el, (set = new Set()));
        set.add(key);
      }
    }
    const next = new Map<Element, string>();
    for (const [el, keys] of nextOver) next.set(el, [...keys].join(" "));
    for (const el of overflow.keys()) if (!next.has(el)) el.removeAttribute(ATTR.over);
    for (const [el, value] of next) if (overflow.get(el) !== value) el.setAttribute(ATTR.over, value);
    overflow = next;

    const overlayKeys = new Set<Key>();
    for (const el of binding.overlayReaders) for (const k of graph.keysOf(el, "reader")) overlayKeys.add(k);
    const overflowKeys = new Set<Key>();
    for (const keys of nextOver.values()) for (const k of keys) overflowKeys.add(k);
    const css = compileGraphCss(
      { writerKeys, readerKeys, overlayKeys: [...overlayKeys], intensities, overflowKeys: [...overflowKeys], selfKeys },
      { gateHover: !sensorOptions.touchPreview, habituation: hab !== null },
    );
    if (css !== compiledCss) {
      compiledCss = css;
      styles.set("compiled", css);
    }
  }

  /** The registered reader at or above `target`. */
  function findReader(target: EventTarget | null): Element | null {
    if (!target || !(target instanceof Node)) return null;
    const start = target instanceof Element ? target : target.parentElement;
    let el = start?.closest(`[${ATTR.by}]`) ?? null;
    while (el && !graph.has(el, "reader")) el = el.parentElement?.closest(`[${ATTR.by}]`) ?? null;
    return el;
  }

  const reverseSheet = () =>
    (reverseCss ??= compileReverseCss(reverseReach(graph, query?.depth ?? 1), { gateHover: !sensorOptions.touchPreview }));

  function startQuery() {
    if (querying || !query || !doc) return;
    if (isEditable(doc.activeElement)) return; // the modifier belongs to the text being typed
    querying = true;
    syncQueryAttr();
    if (mode === "css") {
      // Compiled rules take over; the sheet exists only while the modifier is held.
      styles?.set("reverse", reverseSheet());
    } else {
      const hovered = root?.querySelectorAll(":hover");
      queryTargets.pointer = findReader(hovered?.[hovered.length - 1] ?? null);
      const focused = doc.activeElement;
      queryTargets.focus = focused && isFocusVisible(focused) ? findReader(focused) : null;
      const onOver = (e: Event) => {
        queryTargets.pointer = findReader(e.target);
        schedule();
      };
      const onFocus = (e: Event) => {
        queryTargets.focus = e.target instanceof Element && isFocusVisible(e.target) ? findReader(e.target) : null;
        schedule();
      };
      root!.addEventListener("pointerover", onOver, passive);
      root!.addEventListener("focusin", onFocus, passive);
      detachQueryInput = () => {
        root?.removeEventListener("pointerover", onOver, passive);
        root?.removeEventListener("focusin", onFocus, passive);
      };
      schedule();
    }
    emit(() => ({ type: "query", time: performance.now(), active: true }));
  }

  /** `data-en-query` on the root while a query is held or any `showSources` pin is active. */
  function syncQueryAttr() {
    const docEl = doc?.documentElement;
    if (!docEl) return;
    if (querying || pinned.size > 0) {
      if (!docEl.hasAttribute(ATTR.query)) docEl.setAttribute(ATTR.query, "");
    } else docEl.removeAttribute(ATTR.query);
  }

  function endQuery() {
    if (!querying) return;
    querying = false;
    syncQueryAttr();
    styles?.remove("reverse");
    detachQueryInput?.();
    detachQueryInput = null;
    queryTargets.pointer = queryTargets.focus = null;
    schedule();
    emit(() => ({ type: "query", time: performance.now(), active: false }));
  }

  /** Modifier down starts a query, release (or any other key, or leaving the window) ends it. */
  function attachQueryKeys(d: Document) {
    if (!query) return;
    const view = d.defaultView;
    const onDown = (e: KeyboardEvent) => {
      if (e.key === query.modifier) startQuery();
      else endQuery(); // a shortcut, not an inspection
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === query.modifier) endQuery();
    };
    d.addEventListener("keydown", onDown, passive);
    d.addEventListener("keyup", onUp, passive);
    view?.addEventListener("blur", endQuery);
    d.addEventListener("visibilitychange", endQuery);
    queryDetach.push(() => {
      endQuery();
      d.removeEventListener("keydown", onDown, passive);
      d.removeEventListener("keyup", onUp, passive);
      view?.removeEventListener("blur", endQuery);
      d.removeEventListener("visibilitychange", endQuery);
    });
  }

  function findWriter(target: EventTarget | null): Element | null {
    if (!target || !(target instanceof Node)) return null;
    const el = target instanceof Element ? target : target.parentElement;
    const w = el?.closest(WRITER_SELECTOR) ?? null;
    return w && graph.has(w, "writer") ? w : null;
  }

  /** The recently activated writer, if it writes one of `keys`. */
  function implicitSource(keys: readonly Key[]): Element | null {
    if (!lastActivation || performance.now() - lastActivation.at > IMPLICIT_SOURCE_MS) return null;
    const writerKeys = graph.keysOf(lastActivation.writer, "writer");
    return keys.some((k) => writerKeys.some((w) => keyMatches(w, k))) ? lastActivation.writer : null;
  }

  function confirm(input: ChangeInput, o: ConfirmOptions = {}) {
    const changes = toChanges(input); // invalid keys throw here, not in the next frame
    if (!started || level === "off") return;
    const keys = keysOf(changes);
    const origin = o.origin ?? (intent?.recent() ? "self" : "system");
    if (armed && origin === "self") armed.actual.push(...changes);
    // A collaborator's change was not caused by the control the user last clicked.
    const source = o.source !== undefined ? o.source : origin === "peer" ? null : implicitSource(keys);
    pendingConfirms.push({ changes, options: o, origin, source, deadline: performance.now() + (o.waitMs ?? DEFAULT_CONFIRM_WAIT_MS) });
    const notified = keys.map((k) => effectiveNotify(o.notify ?? notifyFor(k, origin), origin));
    const announced = notified.includes("interrupt") || (isRemote(origin) && notified.includes("aware"));
    if (announcer && announced && o.announce !== false) {
      const format = typeof options.announceRemoteChanges === "function" ? options.announceRemoteChanges : defaultAnnouncement;
      const message = typeof o.announce === "string" ? o.announce : format({ keys, origin, actor: o.actor });
      if (message) announcer.say(message);
    }
    schedule();
  }

  function preview(input: ChangeInput, o: PreviewOptions = {}): () => void {
    const changes = toChanges(input);
    if (level === "off") return () => {}; // nothing previews while cues are off
    const token = {};
    sources.set(token, {
      writer: null,
      changes,
      peek: o.peek,
      destructive: o.severity === "destructive",
      from: o.source,
      holders: new Set(["api"]),
      since: performance.now(),
    });
    schedule();
    return () => {
      previewCache.delete(token);
      if (sources.delete(token)) schedule();
    };
  }

  /**
   * Run a foreseen writer's plan (or reuse its last result while the
   * revision holds) into `src`. False when it previews nothing.
   */
  function resolve(writer: Element, r: Resolver, src: PreviewSource): boolean {
    let res: Resolution | null;
    let cached = false;
    let ms = 0;
    const rev = r.options.revision?.();
    if (r.options.revision && r.last && Object.is(r.last.revision, rev)) {
      res = r.last.result;
      cached = true;
    } else {
      const t0 = performance.now();
      try {
        res = normalize(r.plan());
      } catch (e) {
        console.warn("[entangled] foresight plan threw", e);
        res = null;
      }
      ms = performance.now() - t0;
      r.last = { revision: rev, result: res };
    }
    const budgetMs = r.options.budgetMs ?? options.foresight?.budgetMs ?? 8;
    const changes = res?.changes ?? [];
    emit(() => ({ type: "foresight", time: performance.now(), writer, changes, durationMs: ms, cached, slow: ms > budgetMs }));
    if (!res) return false;
    if (level === "minimal" && r.options.severity !== "destructive") return false;
    src.changes = res.changes;
    src.peek = res.peek;
    src.resolved = true;
    src.destructive = r.options.severity === "destructive";
    lastShown.set(writer, { changes: res.changes, at: performance.now() });
    // Targets cached for the writer are from what it resolved to last time.
    previewCache.delete(writer);
    return true;
  }

  /** A foreseen writer was activated: compare what it showed with the self confirms that follow. */
  function arm(writer: Element) {
    const shown = lastShown.get(writer);
    if (resolvers.get(writer)?.options.deviation === false || !shown || performance.now() - shown.at > FORESEEN_MS) return;
    finalize();
    armed = { writer, foreseen: shown.changes, actual: [], timer: setTimeout(finalize, deviationWindowMs) };
  }

  function finalize() {
    if (!armed) return;
    const { writer, foreseen, actual, timer } = armed;
    clearTimeout(timer);
    armed = null;
    const { unexpected, missing, mismatched } = compareForesight(foreseen, actual);
    if (missing.length || unexpected.length || mismatched.length) {
      emit(() => ({ type: "deviation", time: performance.now(), writer, foreseen, actual, unexpected, missing, mismatched }));
    }
  }

  function sensorContext(name: string): SensorContext {
    return {
      preview,
      root: root!,
      options: sensorOptions,
      findWriter,
      beginPreview(writer) {
        const r = resolvers.get(writer);
        const destructive = writer.getAttribute(ATTR.severity) === "destructive";
        if (level === "minimal" && !r && !destructive) return;
        const form = destructive || writer.hasAttribute(ATTR.change);
        if (mode === "css" && !peekWriters.has(writer) && !r && !form) return; // CSS previews it
        let src = sources.get(writer);
        if (!src) {
          // A static writer's changes come from writerChanges() in flush.
          src = { writer, changes: [], destructive, holders: new Set(), since: performance.now() };
          if (r && !resolve(writer, r, src)) return;
          sources.set(writer, src);
        }
        src.holders.add(name);
        schedule();
      },
      endPreview(writer) {
        const src = sources.get(writer);
        if (!src) return;
        src.holders.delete(name);
        if (src.holders.size === 0) {
          sources.delete(writer);
          // Fully shown: the dwell had passed and the preview finished fading in.
          if (mode === "js" && performance.now() - src.since >= previewMs) exposeWriter(writer);
        }
        schedule();
      },
      activate(writer) {
        lastActivation = { writer, at: performance.now() };
        arm(writer);
        const attr = writer.getAttribute(ATTR.confirm);
        if (attr === "manual" || (attr !== "auto" && !autoConfirm)) return;
        const changes = parseChangeAttr(writer.getAttribute(ATTR.change), graph.keysOf(writer, "writer"));
        if (changes.length) confirm(changes, { source: writer });
      },
    };
  }

  function start() {
    if (started || !hasDom()) return;
    started = true;
    root = options.root ?? document;
    doc = root instanceof Document ? root : root.ownerDocument;

    const docEl = doc.documentElement;

    // Before any sensor: activation confirms must see the event that caused them.
    intent = createIntentTracker(doc, options.originWindowMs ?? 300);
    detach.push(() => intent?.detach());
    if (options.announceRemoteChanges) {
      announcer = createAnnouncer(doc, root instanceof Document ? (doc.body ?? docEl) : root, options.announceIntervalMs ?? 3000);
    }
    if (typeof IntersectionObserver !== "undefined") {
      visibility = new IntersectionObserver((entries) => {
        for (const e of entries) if (visible.has(e.target)) visible.set(e.target, e.isIntersecting);
      });
    }

    registerPreviewProperty();
    styles = createStyleHost(root);
    if (!options.unstyled) for (const s of options.styles ?? []) styles.set(s.name, s.css);
    for (const [name, css] of customEffects) styles.set(`effect:${name}`, wrapEffectCss(css));

    if (options.confirmMs !== undefined) docEl.style.setProperty(VARS.durationConfirm, `${options.confirmMs}ms`);
    else {
      // Let a CSS token override win when no explicit option is given.
      const fromCss = parseDurationMs(getComputedStyle(docEl).getPropertyValue(VARS.durationConfirm));
      if (fromCss !== null) confirmMs = fromCss;
    }
    remoteConfirmMs = options.remoteConfirmMs ?? Math.round(confirmMs * REMOTE_DURATION_SCALE);
    previewMs = parseDurationMs(getComputedStyle(docEl).getPropertyValue("--en-duration-preview")) ?? DEFAULT_PREVIEW_MS;
    if (options.dwellMs !== undefined) docEl.style.setProperty("--en-dwell", `${options.dwellMs}ms`);
    if (options.respectReducedMotion === false) docEl.setAttribute(ATTR.motion, "full");

    overlay = doc.createElement("div");
    overlay.setAttribute(ATTR.overlay, "");
    overlay.setAttribute(ATTR.fx, "veil");
    overlay.setAttribute("aria-hidden", "true");
    // Inline so the overlay can never take part in layout, even when unstyled.
    overlay.style.cssText = "position:fixed;inset:0;pointer-events:none;";
    (root instanceof Document ? docEl : root).appendChild(overlay);

    if (peekAmount !== undefined) docEl.style.setProperty("--en-peek-amount", String(peekAmount));
    tokenPeek = createTokenPeek({
      graph,
      overlayReaders: () => binding?.overlayReaders ?? new Set(),
      styles: () => styles,
      maxAmount: options.peek?.maxAmount,
      domNodes: () => (root instanceof Document ? root.getElementsByTagName("*").length : 0),
      maxGlobalNodes: options.peek?.maxGlobalNodes ?? PEEK_MAX_GLOBAL_NODES,
      gateHover: !sensorOptions.touchPreview,
      habituation: hab !== null,
      warn: (r) => console.warn(`[entangled] peek token ${r.token} for "${r.key}" rejected: ${r.reason}`),
    });
    for (const d of peekDefs) d.dispose = tokenPeek.define(d.def);

    binding = new DomBinding(root, graph, { onInvalidKey, onPeekAttr: (el) => tokenPeek?.onAttr(el), onWriterAttr });
    binding.start(options.observe ?? true);
    tokenPeek.flush();
    // Decide after the initial scan so "auto" sees the real graph.
    mode = resolveMode(root);
    if (mode === "css") {
      binding.setNamespaces(true);
      compile();
    }
    detach.push(
      graph.subscribe((batch) => {
        previewCache = new Map();
        regions = new WeakMap();
        reverseCss = null;
        if (querying) {
          if (mode === "css") styles?.set("reverse", reverseSheet());
          else schedule();
        }
        emit(() => ({ type: "graph", time: performance.now() }));
        for (const change of batch) {
          if (change.type === "remove" && visible.has(change.node) && !graph.has(change.node)) {
            visibility?.unobserve(change.node);
            visible.delete(change.node);
          }
        }
        if (sources.size > 0) schedule();
        tokenPeek?.graphChanged();
        if (hab) syncHabVars(new Set(batch.flatMap((c) => (c.type === "add" && c.role === "writer" ? c.keys : []))));
        maybeDowngrade();
        if (mode === "css") compile();
      }),
    );
    attachInputSensors();
    attachQueryKeys(doc);
    if (hab) {
      if (mode === "css") attachExposureListener(root);
      const view = doc.defaultView;
      const persist = () => {
        if (exposures.length) processExposures();
        hab.flush();
      };
      view?.addEventListener("pagehide", persist);
      detach.push(() => view?.removeEventListener("pagehide", persist));
      syncHabVars([...graph.snapshot().writerKeys, ...tokenPeek.sets().map((s) => s.key)]);
    }
    if (persist && levelFromApi) storeLevel(storageKey, level);
    const stored = persist && !levelFromApi ? readStoredLevel(storageKey) : null;
    if (stored && stored !== level) {
      // Subscribers (useAttentionLevel) read the level before start(): tell them.
      const previous = level;
      level = stored;
      emit(() => ({ type: "level", time: performance.now(), level: stored, previous }));
    }
    // As if coming from an active level, so a stored `off` suspends at once.
    applyLevel("standard");
  }

  /** Make the DOM match `level` (only while started). */
  function applyLevel(previous: AttentionLevel) {
    if (!started || !doc) return;
    const docEl = doc.documentElement;
    docEl.setAttribute(ATTR.level, level);
    if (level === "off") return suspend();
    if (previous === "off") resume();
    const dwell = level === "guided" ? Math.round(dwellMs / 2) : dwellMs;
    sensorOptions.dwellMs = dwell;
    if (options.dwellMs !== undefined || level === "guided") docEl.style.setProperty("--en-dwell", `${dwell}ms`);
    else docEl.style.removeProperty("--en-dwell");
    if (level === "minimal") docEl.style.setProperty("--en-peek-amount", "0");
    else restorePeekAmount();
    if (mode === "css") compile();
    if (hab && (level === "guided") !== (previous === "guided")) {
      multipliers = new Map();
      if (level === "guided") clearHabVars();
      else syncHabVars([...graph.snapshot().writerKeys, ...(tokenPeek?.sets().map((s) => s.key) ?? [])]);
    }
    schedule();
  }

  function restorePeekAmount() {
    const style = doc?.documentElement.style;
    if (peekAmount !== undefined) style?.setProperty("--en-peek-amount", String(peekAmount));
    else style?.removeProperty("--en-peek-amount");
  }

  /**
   * `off`: stop cueing without tearing down. The graph, the observer, the
   * injected styles, the overlay and Token Peek definitions stay, so turning
   * cues back on is instant.
   */
  function suspend() {
    for (const d of sensorDetach.splice(0)) d();
    hoverSensors = false;
    endQuery();
    for (const d of queryDetach.splice(0)) d();
    pinned.clear();
    syncQueryAttr();
    sources.clear();
    pendingConfirms = [];
    confirms.clear();
    restarting.clear();
    for (const el of applied.keys()) clear(el);
    applied = new Map();
    clearSticky();
    applyDeltas(new Map());
    applySources(new Set());
    styles?.remove("compiled");
    styles?.remove("reverse");
    compiledCss = "";
    doc?.documentElement.style.setProperty("--en-peek-amount", "0");
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    clearTimeout(expiryTimer);
    expiryTimer = undefined;
  }

  function resume() {
    attachInputSensors();
    if (doc) attachQueryKeys(doc);
    if (mode === "css") compile();
    restorePeekAmount();
  }

  function foresee(el: Element, plan: ForesightPlan, o: ForeseeOptions = {}) {
    const r: Resolver = { plan, options: o };
    resolvers.set(el, r);
    if (mode === "css") ensureHoverSensors();
    return () => {
      if (resolvers.get(el) !== r) return;
      resolvers.delete(el);
      lastShown.delete(el);
    };
  }

  function setLevel(next: AttentionLevel) {
    if (!(ATTENTION_LEVELS as readonly string[]).includes(next)) {
      if (!warnedLevel) console.warn(`[entangled] ignoring invalid attention level "${next}"`);
      warnedLevel = true;
      return;
    }
    levelFromApi = true;
    // Storage is never touched before start() (SSR); start() stores a level set earlier.
    if (persist && started) storeLevel(storageKey, next);
    if (next === level) return;
    const previous = level;
    level = next;
    emit(() => ({ type: "level", time: performance.now(), level: next, previous }));
    if (started) applyLevel(previous);
  }

  function destroy() {
    if (!started) return;
    for (const d of detach.splice(0)) d();
    for (const d of sensorDetach.splice(0)) d();
    for (const d of queryDetach.splice(0)) d();
    pinned.clear();
    finalize();
    lastShown.clear();
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    clearTimeout(expiryTimer);
    for (const el of applied.keys()) clear(el);
    applied = new Map();
    clearSticky();
    confirms.clear();
    restarting.clear();
    lastGlow = new WeakMap();
    visibility?.disconnect();
    visibility = null;
    visible.clear();
    announcer?.destroy();
    announcer = null;
    intent = null;
    sources.clear();
    pendingConfirms = [];
    lastActivation = null;
    applyDeltas(new Map());
    applySources(new Set());
    reverseCss = null;
    peekNotified.clear();
    hoverSensors = false;
    tokenPeek?.destroy();
    tokenPeek = null;
    exposureTask?.();
    exposureTask = null;
    if (exposures.length) processExposures(); // keep what was seen
    hab?.flush();
    clearHabVars();
    for (const d of peekDefs) d.dispose = null;
    doc!.documentElement.style.removeProperty("--en-peek-amount");
    for (const el of overflow.keys()) el.removeAttribute(ATTR.over);
    overflow = new Map();
    compiledCss = "";
    binding?.destroy();
    styles?.destroy();
    overlay?.remove();
    const docEl = doc!.documentElement;
    if (options.confirmMs !== undefined) docEl.style.removeProperty(VARS.durationConfirm);
    docEl.style.removeProperty("--en-dwell");
    sensorOptions.dwellMs = dwellMs;
    if (options.respectReducedMotion === false) docEl.removeAttribute(ATTR.motion);
    docEl.removeAttribute(ATTR.level);
    docEl.removeAttribute(ATTR.query);
    binding = null;
    styles = null;
    overlay = null;
    root = null;
    started = false;
    mode = "js";
  }

  return {
    graph,
    get mode() {
      return mode;
    },
    get started() {
      return started;
    },
    profile,
    get level() {
      return level;
    },
    setLevel,
    start,
    destroy,
    confirm,
    markUserIntent() {
      intent?.mark();
    },
    sourcesOf: (el) => [...sourcesOf(graph, el, query?.depth ?? 1)],
    showSources(el) {
      const token = {};
      pinned.set(token, el);
      syncQueryAttr();
      schedule();
      return () => {
        if (!pinned.delete(token)) return;
        syncQueryAttr();
        schedule();
      };
    },
    get querying() {
      return querying;
    },
    onEvent(listener) {
      eventListeners.add(listener);
      return () => {
        eventListeners.delete(listener);
      };
    },
    preview,
    definePeekTokens(def) {
      const entry = { def, dispose: tokenPeek?.define(def) ?? null };
      peekDefs.push(entry);
      return () => {
        entry.dispose?.();
        const i = peekDefs.indexOf(entry);
        if (i >= 0) peekDefs.splice(i, 1);
      };
    },
    habituation: {
      get enabled() {
        return hab !== null;
      },
      reset(key) {
        if (!hab) return;
        hab.reset(key);
        multipliers = new Map();
        if (key === undefined) clearHabVars();
        else syncHabVars([key]);
      },
      inspect: () => hab?.inspect() ?? [],
    },
    get peekRejections() {
      return tokenPeek?.rejected ?? [];
    },
    peekWriter(el, peek) {
      peekWriters.set(el, peek);
      return () => {
        if (peekWriters.get(el) === peek) peekWriters.delete(el);
      };
    },
    foresee,
    formatReader(el, format) {
      formatters.set(el, format);
      if (mode === "css") ensureHoverSensors();
      return () => {
        if (formatters.get(el) !== format) return;
        formatters.delete(el);
        if (deltas.delete(el)) el.removeAttribute(ATTR.delta);
      };
    },
    peekReader(el, delta) {
      peekReaders.set(el, delta);
      if (mode === "css") ensureHoverSensors();
      return () => {
        if (peekReaders.get(el) !== delta) return;
        peekReaders.delete(el);
        if (deltas.delete(el)) el.removeAttribute(ATTR.delta);
      };
    },
    onPeek(key, listener) {
      let set = peekListeners.get(key);
      if (!set) peekListeners.set(key, (set = new Set()));
      set.add(listener);
      if (mode === "css") ensureHoverSensors();
      return () => {
        set.delete(listener);
        if (set.size === 0) {
          peekListeners.delete(key);
          peekNotified.delete(key);
        }
      };
    },
    registerEffect(name, css) {
      customEffects.set(name, css);
      styles?.set(`effect:${name}`, wrapEffectCss(css));
    },
    getState(el) {
      const a = applied.get(el);
      const source = sourced.has(el);
      if (!a) return source ? { ...IDLE, source } : IDLE;
      const kind = a.change.kind && a.change.kind !== "modify" ? a.change.kind : null;
      return { state: a.state, intensity: a.intensity, key: a.key, origin: a.origin, source, kind, label: deltas.get(el) ?? null };
    },
  };
}
