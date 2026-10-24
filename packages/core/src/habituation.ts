import type { Key } from "./key.js";
import type { Origin } from "./origin.js";

/**
 * Habituation: effects quiet down as a user keeps seeing the same one, and
 * recover after a period of non-use. New users get guidance; experienced
 * users get a quiet UI. Fully deterministic: an exposure counter per
 * (key, kind), counting only `self` confirms, and a fixed curve; no learning model.
 *
 * Privacy: only keys, counts and the time of the last exposure are stored.
 */

/** The effect families that habituate independently. */
export type EffectKind = "preview" | "peek" | "confirm";

/** Resolved habituation settings. */
export interface HabituationConfig {
  /** Exposures after which an effect is at half intensity. Default 5. */
  halfLife: number;
  /** Lowest multiplier per kind. Default preview 0.2, peek 0.5 (informational), confirm 0.2. */
  floors: Record<EffectKind, number>;
  /** The stored count halves after each this many days without exposure. Default 7. */
  recoveryDays: number;
  /** Where counts live. Default: `localStorage` (in-memory if unavailable). */
  store: HabituationStore;
}

/** `HabituationConfig` with every field optional; `floors` merge per kind. */
export type HabituationOptions = Partial<Omit<HabituationConfig, "floors">> & {
  floors?: Partial<Record<EffectKind, number>>;
};

/** One stored counter: feature version, exposure count, last exposure (ms since epoch). */
export interface HabituationEntry {
  /** Feature version (`""` when unversioned). */
  v: string;
  /** Exposure count, fractional after recovery. */
  n: number;
  /** Last exposure, ms since epoch. */
  t: number;
}

/** Pluggable persistence. Every method must be synchronous and must not throw. */
export interface HabituationStore {
  /** Read one counter. */
  get(id: string): HabituationEntry | undefined;
  /** Write one counter. */
  set(id: string, entry: HabituationEntry): void;
  /** Remove one counter, or all of them. */
  reset(id?: string): void;
  /** Every stored id, for `inspect()`. Optional. */
  keys?(): Iterable<string>;
  /** Write anything pending now (called on `destroy()` and `pagehide`). Optional. */
  flush?(): void;
}

/**
 * Cross-device sync, implemented by the app: `load` seeds the local
 * store once, `save` receives every debounced write. Merging keeps the
 * higher count and the later exposure.
 */
export interface HabituationSyncAdapter {
  /** Remote entries to merge in, sync or async. */
  load(): Record<string, HabituationEntry> | Promise<Record<string, HabituationEntry>>;
  /** Every local entry, after each debounced write. */
  save(entries: Record<string, HabituationEntry>): void;
}

/** One counter as reported by `inspect()`. */
export interface HabituationRecord {
  /** The key, with its version suffix if any (`export@2`). */
  key: Key;
  /** Effect family. */
  kind: EffectKind;
  /** Set for `confirm` (only `self` confirms habituate). */
  origin?: Origin;
  /** Exposures after recovery. */
  count: number;
  /** Current multiplier (0-1). */
  multiplier: number;
  /** Last exposure, ms since epoch. */
  lastSeen: number;
}

/** Default curve: half-life 5, floors 0.2/0.5/0.2, recovery 7 days. */
export const HABITUATION_DEFAULTS: Readonly<Omit<HabituationConfig, "store">> = Object.freeze({
  halfLife: 5,
  floors: Object.freeze({ preview: 0.2, peek: 0.5, confirm: 0.2 }),
  recoveryDays: 7,
});

const DAY_MS = 86_400_000;

/** `m(n) = max(floor, 0.5 ^ (n / halfLife))`, rounded to 3 decimals. */
export function habituationMultiplier(n: number, halfLife: number, floor: number): number {
  if (!(n > 0) || !(halfLife > 0)) return 1;
  return Math.round(Math.max(floor, 0.5 ** (n / halfLife)) * 1000) / 1000;
}

/** The count after recovery: halved once per full `recoveryDays` since the last exposure. */
export function recoveredCount(entry: HabituationEntry, now: number, recoveryDays: number): number {
  if (!(recoveryDays > 0)) return entry.n;
  const periods = Math.floor(Math.max(0, now - entry.t) / (recoveryDays * DAY_MS));
  return entry.n / 2 ** periods;
}

/**
 * Split a feature version off a key: `export@2` -> `{ base: "export", version: "2" }`.
 * Shipping `export@3` resets habituation for `export`.
 */
export function parseVersionedKey(key: Key): { base: string; version: string } {
  const at = key.lastIndexOf("@");
  if (at <= 0 || at === key.length - 1 || key.indexOf(":", at) !== -1) return { base: key, version: "" };
  return { base: key.slice(0, at), version: key.slice(at + 1) };
}

/** Whether a kind/origin decays at all: remote confirms are news, not lessons. */
export const habituates = (kind: EffectKind, origin?: Origin) => kind !== "confirm" || origin === undefined || origin === "self";

const idOf = (kind: EffectKind, base: string) => `${kind}:${base}`;

/**
 * CSS-safe custom property for a key's multiplier: `media:42` -> `--en-int-media_3a_42`
 * (`--en-pint-` for peek).
 */
export function habituationVar(key: Key, kind: "preview" | "peek"): string {
  const safe = key.replace(/[^A-Za-z0-9-]/g, (c) => `_${c.charCodeAt(0).toString(16)}_`);
  return `${kind === "preview" ? "--en-int-" : "--en-pint-"}${safe}`;
}

/** Non-persistent store, e.g. for tests or SSR. */
export function memoryHabituationStore(): HabituationStore {
  const map = new Map<string, HabituationEntry>();
  return {
    get: (id) => map.get(id),
    set: (id, entry) => void map.set(id, entry),
    reset: (id) => (id === undefined ? map.clear() : void map.delete(id)),
    keys: () => map.keys(),
  };
}

const SCHEMA = 1;

/** Options for `localStorageHabituationStore`. */
export interface LocalStorageStoreOptions {
  /** Default `"entangled:habituation"`. */
  storageKey?: string;
  /** Writes are batched this long (ms). Default 1000. */
  debounceMs?: number;
  /** Optional cross-device sync. */
  sync?: HabituationSyncAdapter;
}

/**
 * `localStorage`-backed store with a versioned schema and debounced writes.
 * Every access is wrapped: when storage is unavailable (private mode, quota,
 * disabled cookies, SSR) it keeps working in memory.
 */
export function localStorageHabituationStore(options: LocalStorageStoreOptions = {}): HabituationStore & { flush(): void } {
  // Nothing touches storage until the first access: safe to create during SSR.
  const storageKey = options.storageKey ?? "entangled:habituation";
  const debounceMs = options.debounceMs ?? 1000;
  const memory = new Map<string, HabituationEntry>();
  let loaded = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const storage = (): Storage | null => {
    try {
      return typeof localStorage === "undefined" ? null : localStorage;
    } catch {
      return null;
    }
  };

  /**
   * Same version: keep the higher count and later exposure. Different versions: the newer one wins.
   */
  const merge = (entries: Record<string, HabituationEntry>) => {
    for (const [id, e] of Object.entries(entries)) {
      const cur = memory.get(id);
      if (!cur || (cur.v !== e.v && e.t > cur.t)) memory.set(id, e);
      else if (cur.v === e.v) memory.set(id, { v: e.v, n: Math.max(cur.n, e.n), t: Math.max(cur.t, e.t) });
    }
  };

  const load = () => {
    if (loaded) return;
    loaded = true;
    try {
      const raw = storage()?.getItem(storageKey);
      const data = raw ? (JSON.parse(raw) as { v?: number; entries?: Record<string, [string, number, number]> }) : null;
      if (data?.v === SCHEMA && data.entries) {
        for (const [id, [v, n, t]] of Object.entries(data.entries)) {
          if (typeof v === "string" && Number.isFinite(n) && Number.isFinite(t)) memory.set(id, { v, n, t });
        }
      }
    } catch {
      /* corrupt or unavailable: start fresh in memory */
    }
    try {
      const remote = options.sync?.load();
      if (remote && typeof (remote as Promise<unknown>).then === "function") {
        (remote as Promise<Record<string, HabituationEntry>>).then(merge, () => {});
      } else if (remote) merge(remote as Record<string, HabituationEntry>);
    } catch {
      /* sync is best-effort */
    }
  };

  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    if (!loaded) return;
    const entries: Record<string, [string, number, number]> = {};
    for (const [id, e] of memory) entries[id] = [e.v, Math.round(e.n * 1000) / 1000, e.t];
    try {
      const s = storage();
      if (memory.size === 0) s?.removeItem(storageKey);
      else s?.setItem(storageKey, JSON.stringify({ v: SCHEMA, entries }));
    } catch {
      /* quota or disabled: memory still has it */
    }
    try {
      options.sync?.save(Object.fromEntries(memory));
    } catch {
      /* best-effort */
    }
  };
  const schedule = () => {
    timer ??= setTimeout(flush, debounceMs);
  };

  return {
    get(id) {
      load();
      return memory.get(id);
    },
    set(id, entry) {
      load();
      memory.set(id, entry);
      schedule();
    },
    reset(id) {
      load();
      if (id === undefined) memory.clear();
      else memory.delete(id);
      schedule();
    },
    keys() {
      load();
      return [...memory.keys()];
    },
    flush,
  };
}

/** A habituation tracker over one store. */
export interface Habituation {
  /** Resolved settings. */
  readonly config: Readonly<HabituationConfig>;
  /** Current multiplier (0-1) for an effect of `key`. */
  multiplier(key: Key, kind: EffectKind, origin?: Origin): number;
  /** Count one fully shown exposure. Returns the new multiplier. */
  expose(key: Key, kind: EffectKind, origin?: Origin): number;
  /** Forget one key (every kind), or everything. */
  reset(key?: Key): void;
  /** Every known counter, sorted by key then kind. */
  inspect(): HabituationRecord[];
  /** Persist pending writes now. */
  flush(): void;
}

/**
 * Create a tracker. `now` is injectable for tests. Default store: `localStorageHabituationStore()`.
 */
export function createHabituation(options: HabituationOptions = {}, now: () => number = Date.now): Habituation {
  const config: HabituationConfig = {
    halfLife: options.halfLife ?? HABITUATION_DEFAULTS.halfLife,
    floors: { ...HABITUATION_DEFAULTS.floors, ...options.floors },
    recoveryDays: options.recoveryDays ?? HABITUATION_DEFAULTS.recoveryDays,
    store: options.store ?? localStorageHabituationStore(),
  };
  const { store } = config;
  /** Ids seen this session, for stores without `keys()`. */
  const seen = new Set<string>();

  const safe = <T>(fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };

  const countOf = (kind: EffectKind, key: Key) => {
    const { base, version } = parseVersionedKey(key);
    const entry = safe(() => store.get(idOf(kind, base)), undefined);
    // A new feature version starts over.
    if (!entry || entry.v !== version) return 0;
    return recoveredCount(entry, now(), config.recoveryDays);
  };

  return {
    config,
    multiplier(key, kind, origin) {
      if (!habituates(kind, origin)) return 1;
      return habituationMultiplier(countOf(kind, key), config.halfLife, config.floors[kind]);
    },
    expose(key, kind, origin) {
      if (!habituates(kind, origin)) return 1;
      const { base, version } = parseVersionedKey(key);
      const n = countOf(kind, key) + 1;
      const id = idOf(kind, base);
      seen.add(id);
      safe(() => store.set(id, { v: version, n, t: now() }), undefined);
      return habituationMultiplier(n, config.halfLife, config.floors[kind]);
    },
    reset(key) {
      if (key === undefined) {
        safe(() => store.reset(), undefined);
        seen.clear();
        return;
      }
      const { base } = parseVersionedKey(key);
      for (const kind of ["preview", "peek", "confirm"] as const) {
        safe(() => store.reset(idOf(kind, base)), undefined);
        seen.delete(idOf(kind, base));
      }
    },
    flush() {
      safe(() => store.flush?.(), undefined);
    },
    inspect() {
      const ids = new Set([...safe(() => [...(store.keys?.() ?? [])], [] as string[]), ...seen]);
      const out: HabituationRecord[] = [];
      for (const id of ids) {
        const colon = id.indexOf(":");
        const kind = id.slice(0, colon) as EffectKind;
        const base = id.slice(colon + 1);
        const entry = safe(() => store.get(id), undefined);
        if (!entry || !(kind in config.floors)) continue;
        const key = entry.v ? `${base}@${entry.v}` : base;
        const count = recoveredCount(entry, now(), config.recoveryDays);
        out.push({
          key,
          kind,
          ...(kind === "confirm" ? { origin: "self" as const } : {}),
          count: Math.round(count * 1000) / 1000,
          multiplier: habituationMultiplier(count, config.halfLife, config.floors[kind]),
          lastSeen: entry.t,
        });
      }
      const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
      return out.sort((a, b) => cmp(a.key, b.key) || cmp(a.kind, b.kind));
    },
  };
}
